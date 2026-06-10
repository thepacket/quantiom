/**
 * Agent mode — the tool layer that lets the AI chat *act on* Quantiom, not
 * just describe changes.
 *
 * Each tool maps to code that already exists (reducers, simulator, transforms,
 * emitters). `AGENT_TOOLS` is the OpenAI/OpenRouter function-calling schema the
 * model sees; `executeTool` runs a call against the live circuit via a small
 * `AgentContext` and returns a short text result the model reads back.
 *
 * Safety: every *mutation* routes through `ctx.applyCircuit`, which dispatches
 * a normal undo-able reducer action — so anything the AI does is one ⌘Z away.
 * Reads never mutate. There is no `eval`, no network, no file access here.
 */

import type { Circuit, GateId } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "../sim/simulate";
import { paulis, pauliSumExpectation, type Pauli } from "../sim/expectation";
import { parsePauliSum } from "../sim/trotter";
import { estimateResources } from "../sim/resources";
import { optimiseCircuit } from "../sim/optimisePasses";
import { transpile, type TranspileTarget } from "../sim/transpile";
import { compileForDevice } from "../sim/compile";
import { inverseGates } from "../editor/inverse";
import { parseQasm3 } from "../qasm/parse";
import { emitQasm3 } from "../qasm/emit";
import { GATES } from "../editor/gates";

export type AgentContext = {
  getCircuit: () => Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  /** Replace the active circuit (routes through undo). */
  applyCircuit: (next: Circuit, label: string) => void;
  /** Coupling map for compile/route, if a noise model imported one. */
  coupling?: number[][];
  /** Push a custom plot spec (the `requestCustomPlot` bridge). */
  addPlot: (spec: unknown) => void;
};

// ─── tool schemas (what the model sees) ───────────────────────────────

const t = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

const TARGET_ENUM = ["clifford-t", "ibm-heavy-hex", "rigetti"];

export const AGENT_TOOLS = [
  t("get_circuit_qasm", "Return the current circuit as OpenQASM 3 so you can read its exact structure.", {}),
  t("get_resources", "Return gate counts, CX count, T-count/T-depth, parallel depth, and qubit usage of the current circuit.", {}),
  t(
    "get_state",
    "Simulate the current circuit and return the top basis states by probability (amplitude + probability). Use to read the actual output.",
    { top: { type: "integer", description: "How many top basis states to return (default 16, max 64)." } },
  ),
  t(
    "expectation",
    "Compute ⟨P⟩ for a Pauli string (e.g. \"ZZI\") or ⟨H⟩ for a Pauli sum (e.g. \"0.5 ZZ + X\") on the current circuit's output.",
    { observable: { type: "string", description: "A Pauli string of length n, or a weighted Pauli sum." } },
    ["observable"],
  ),
  t(
    "set_circuit_qasm",
    "Replace the entire circuit with one you write as OpenQASM 3. The primary way to build or rewrite a circuit. Undo-able.",
    { qasm: { type: "string", description: "Full OpenQASM 3 source." } },
    ["qasm"],
  ),
  t(
    "place_gate",
    "Append one gate to the current circuit. Undo-able. Use IR gate ids (h, x, cx, rz, t, …).",
    {
      gate: { type: "string", description: "Gate id, e.g. h, x, cx, ccx, rz, u." },
      targets: { type: "array", items: { type: "integer" }, description: "Target qubit indices." },
      controls: { type: "array", items: { type: "integer" }, description: "Control qubit indices (optional)." },
      params: { type: "array", items: { type: "string" }, description: "Parameter expressions, e.g. [\"pi/2\"] (optional)." },
    },
    ["gate", "targets"],
  ),
  t(
    "remove_gate",
    "Remove the gate at a given column acting on a given target qubit. Undo-able.",
    { column: { type: "integer" }, target: { type: "integer" } },
    ["column", "target"],
  ),
  t("add_qubits", "Increase the circuit's qubit count by `count` (1–20 total). Undo-able.", { count: { type: "integer" } }, ["count"]),
  t("optimise", "Run the peephole optimiser on the current circuit and report the gate-count reduction. Undo-able.", {
    deep: { type: "boolean", description: "Enable deep commute-through-diagonals merges." },
  }),
  t("transpile", "Transpile the circuit to a target native gate set and report the new gate/CX/T counts. Undo-able.", {
    target: { type: "string", enum: TARGET_ENUM },
  }, ["target"]),
  t("compile", "Run the full Transpile→Optimise→Route→Optimise pipeline for a target. Undo-able.", {
    target: { type: "string", enum: TARGET_ENUM },
  }, ["target"]),
  t("append_inverse", "Append U† (the inverse of the current circuit) so the whole thing composes to identity. Undo-able.", {}),
  t(
    "add_plot",
    "Add a custom plot to the Custom plots panel. `quantity` is one of the catalog quantities (expZ, prob, mutualInfo, entropy, magic, pauli, energy, otoc, …); optional sweep (none/column/t), chart, and args.",
    {
      quantity: { type: "string" },
      sweep: { type: "string", enum: ["none", "column", "t"] },
      chart: { type: "string", enum: ["bars", "line", "heatmap", "scatter"] },
      args: { type: "object", description: "Extra args for parameterized quantities (pauli, hamiltonian, cut, …)." },
    },
    ["quantity"],
  ),
];

/** Names that mutate the circuit (for UI labelling / gating). */
export const MUTATING_TOOLS = new Set([
  "set_circuit_qasm", "place_gate", "remove_gate", "add_qubits", "optimise", "transpile", "compile", "append_inverse",
]);

// ─── execution ────────────────────────────────────────────────────────

const GATE_IDS = new Set(GATES.map((g) => g.id));

/** Run a tool call. Returns a short text result; throws Error on failure
 *  (the caller turns the message into a tool-result the model reads). */
export function executeTool(name: string, args: Record<string, unknown>, ctx: AgentContext): string {
  const circuit = ctx.getCircuit();
  switch (name) {
    case "get_circuit_qasm":
      return emitQasm3(circuit);

    case "get_resources":
      return resourceText(circuit);

    case "get_state": {
      const top = clampInt(args.top, 16, 1, 64);
      const res = simulate(circuit, ctx.paramValues, ctx.customGates);
      if (res.isStabilizer) return "Clifford fast path — explicit amplitudes are not enumerated (use get_resources / expectation).";
      const n = circuit.numQubits;
      const dim = 1 << n;
      const rows: Array<{ b: string; p: number; re: number; im: number }> = [];
      for (let i = 0; i < dim; i++) {
        const re = res.state[2 * i], im = res.state[2 * i + 1];
        const p = re * re + im * im;
        if (p > 1e-10) rows.push({ b: i.toString(2).padStart(n, "0"), p, re, im });
      }
      rows.sort((a, b) => b.p - a.p);
      const head = `Top ${Math.min(top, rows.length)} of ${rows.length} non-zero basis states:`;
      return [head, ...rows.slice(0, top).map((r) => `  |${r.b}⟩  p=${r.p.toFixed(5)}  amp=${r.re.toFixed(4)}${r.im >= 0 ? "+" : "−"}${Math.abs(r.im).toFixed(4)}i`)].join("\n");
    }

    case "expectation": {
      const obs = String(args.observable ?? "").trim();
      if (!obs) throw new Error("observable is required");
      let terms;
      try { terms = parsePauliSum(obs); } catch (e) { throw new Error(`could not parse observable: ${e instanceof Error ? e.message : e}`); }
      const n = circuit.numQubits;
      if (terms.some((tm) => tm.paulis.length !== n)) throw new Error(`Pauli strings must have length ${n} (the qubit count)`);
      const res = simulate(circuit, ctx.paramValues, ctx.customGates);
      if (terms.length === 1 && terms[0].coefficient === 1) {
        const v = paulis(res.state, n, terms[0].paulis.split("") as Pauli[]);
        return `⟨${terms[0].paulis}⟩ = ${v.toFixed(6)}`;
      }
      const v = pauliSumExpectation(res.state, n, terms);
      return `⟨H⟩ = ${v.toFixed(6)} for H = ${obs}`;
    }

    case "set_circuit_qasm": {
      const qasm = String(args.qasm ?? "");
      const parsed = parseQasm3(qasm);
      if (!parsed.ok) throw new Error(`QASM parse error on line ${parsed.line}: ${parsed.error}`);
      ctx.applyCircuit(parsed.circuit, "AI: set circuit");
      return `Circuit replaced. ${resourceText(parsed.circuit)}`;
    }

    case "place_gate": {
      const gate = String(args.gate ?? "");
      if (!GATE_IDS.has(gate as GateId)) throw new Error(`unknown gate id "${gate}"`);
      const targets = intArray(args.targets);
      if (!targets.length) throw new Error("targets is required");
      const controls = intArray(args.controls);
      const params = strArray(args.params);
      const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
      const need = Math.max(...targets, ...controls, -1) + 1;
      const next: Circuit = {
        ...circuit,
        numQubits: Math.max(circuit.numQubits, need),
        gates: [...circuit.gates, { id: `ai${Date.now()}${Math.floor(Math.random() * 1e4)}`, gateId: gate as GateId, column: maxCol + 1, controls, targets, clbits: [], params }],
      };
      ctx.applyCircuit(next, `AI: place ${gate}`);
      return `Placed ${gate} on ${targets.join(",")}${controls.length ? ` controlled by ${controls.join(",")}` : ""} at column ${maxCol + 1}.`;
    }

    case "remove_gate": {
      const column = clampInt(args.column, -1, 0, 1e6);
      const target = clampInt(args.target, -1, 0, 1e6);
      const idx = circuit.gates.findIndex((g) => g.column === column && g.targets.includes(target));
      if (idx < 0) throw new Error(`no gate at column ${column} on qubit ${target}`);
      const removed = circuit.gates[idx];
      ctx.applyCircuit({ ...circuit, gates: circuit.gates.filter((_, i) => i !== idx) }, `AI: remove ${removed.gateId}`);
      return `Removed ${removed.gateId} at column ${column} on qubit ${target}.`;
    }

    case "add_qubits": {
      const count = clampInt(args.count, 1, 1, 20);
      const next = Math.min(20, circuit.numQubits + count);
      if (next === circuit.numQubits) throw new Error("already at the 20-qubit cap");
      ctx.applyCircuit({ ...circuit, numQubits: next }, "AI: add qubits");
      return `Circuit now has ${next} qubits.`;
    }

    case "optimise": {
      const r = optimiseCircuit(circuit, { deep: !!args.deep });
      ctx.applyCircuit(r.circuit, "AI: optimise");
      const rules = Object.entries(r.rulesFired).map(([k, v]) => `${k}×${v}`).join(", ") || "no rules fired";
      return `Optimised: ${r.before} → ${r.after} gates over ${r.passes} pass(es). ${rules}.`;
    }

    case "transpile": {
      const target = String(args.target ?? "") as TranspileTarget;
      if (!TARGET_ENUM.includes(target)) throw new Error(`target must be one of ${TARGET_ENUM.join(", ")}`);
      const r = transpile(circuit, target);
      ctx.applyCircuit(r.circuit, `AI: transpile ${target}`);
      return `Transpiled to ${target}. ${resourceText(r.circuit)}`;
    }

    case "compile": {
      const target = String(args.target ?? "") as TranspileTarget;
      if (!TARGET_ENUM.includes(target)) throw new Error(`target must be one of ${TARGET_ENUM.join(", ")}`);
      const r = compileForDevice(circuit, target, ctx.coupling);
      ctx.applyCircuit(r.circuit, `AI: compile ${target}`);
      return `Compiled for ${target}. ${resourceText(r.circuit)}`;
    }

    case "append_inverse": {
      const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
      const { inverted, skipped } = inverseGates(circuit, 0, maxCol);
      if (!inverted.length) throw new Error("nothing to invert");
      ctx.applyCircuit({ ...circuit, gates: [...circuit.gates, ...inverted] }, "AI: append U†");
      return `Appended ${inverted.length} inverse gates${skipped.length ? ` (${skipped.length} couldn't be inverted and were skipped)` : ""}. The circuit now composes to identity.`;
    }

    case "add_plot": {
      ctx.addPlot({ quantity: args.quantity, sweep: args.sweep, chart: args.chart, args: args.args });
      return `Added a "${args.quantity}" plot to the Custom plots panel.`;
    }

    default:
      throw new Error(`unknown tool "${name}"`);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function resourceText(circuit: Circuit): string {
  const r = estimateResources(circuit);
  return `${r.totalGates} gates (${r.oneQubit} 1q, ${r.twoQubit} 2q), CX=${r.cxCount}, T-count=${r.tCount}, T-depth=${r.tDepth}, depth=${r.parallelDepth}, qubits=${circuit.numQubits} (${r.distinctQubits} used).`;
}

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  const x = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}
function intArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => parseInt(String(x), 10)).filter((x) => Number.isFinite(x)) : [];
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}
