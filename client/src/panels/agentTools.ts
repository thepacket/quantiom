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
import { emitQasm2 } from "../qasm/emitQasm2";
import { emitQiskit } from "../qasm/emitQiskit";
import { emitCirq } from "../qasm/emitCirq";
import { emitBraket } from "../qasm/emitBraket";
import { emitQSharp } from "../qasm/emitQSharp";
import { emitPyQuil } from "../qasm/emitPyQuil";
import { emitPytket } from "../qasm/emitPytket";
import { emitQuantikz } from "../qasm/emitQuantikz";
import { emitStim } from "../qasm/emitStim";
import { parseTargetState, statePrepCircuit } from "../sim/statePrep";
import { synthesizeUnitary, type Cx } from "../sim/unitarySynth";
import { buildTrotterCircuit, type TrotterOrder } from "../sim/trotter";
import { equivalenceCheck } from "../sim/equivalence";
import type { NoiseModel } from "../sim/noise";
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
  /** Open a circuit in a new tab (keeps the current one). */
  openInNewTab?: (circuit: Circuit, name?: string) => void;
  /** Current noise model + setter, for the set_noise tool. */
  noise?: NoiseModel;
  setNoise?: (next: NoiseModel) => void;
  /** Multi-tab management. */
  listTabs?: () => Array<{ index: number; name: string; numQubits: number; active: boolean }>;
  switchTab?: (index: number) => boolean;
  /** Save a circuit as a reusable custom gate. */
  saveCustomGate?: (circuit: Circuit, name: string) => void;
  /** Set the parameter-slider values (free symbols). */
  setParams?: (values: ParameterValues) => void;
  /** Add a sandboxed `plotjs` program to the Custom plots panel. */
  addPlotProgram?: (code: string) => void;
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
  t(
    "prepare_state",
    "Synthesize a circuit that prepares a target statevector from |0…0⟩ (Möttönen) and make it the current circuit. Undo-able.",
    {
      target: { type: "string", description: "Amplitude list of 2ⁿ values (reals or a+bi) OR a basis-state label like \"011\"." },
      qubits: { type: "integer", description: "Number of qubits n (1–8)." },
    },
    ["target", "qubits"],
  ),
  t("synthesize_unitary", "Re-express the current circuit's unitary as controlled-u_arb two-level gates (universal, not CNOT-optimal). ≤ 4 qubits. Undo-able.", {}),
  t(
    "trotterise",
    "Replace the circuit with a Trotter circuit for a Pauli-sum Hamiltonian (exp(-iHt)). Undo-able.",
    {
      hamiltonian: { type: "string", description: "Pauli sum, e.g. \"0.5 ZZ + X\" (all terms same length)." },
      steps: { type: "integer", description: "Trotter steps (default 1)." },
      order: { type: "integer", enum: [1, 2, 4], description: "Splitting order (default 1)." },
    },
    ["hamiltonian"],
  ),
  t(
    "export_circuit",
    "Return the current circuit as code/text in a given format (read-only). Use to show the user a code export.",
    { format: { type: "string", enum: ["qasm3", "qasm2", "qiskit", "cirq", "braket", "qsharp", "pyquil", "pytket", "quantikz", "stim", "json"] } },
    ["format"],
  ),
  t(
    "check_equivalent",
    "Compare the current circuit to a circuit you provide as OpenQASM 3 and report whether they're equivalent (process fidelity, trace distance). Read-only.",
    { qasm: { type: "string", description: "OpenQASM 3 of the comparison circuit." } },
    ["qasm"],
  ),
  t(
    "open_in_new_tab",
    "Open a circuit (OpenQASM 3) in a NEW tab, leaving the current circuit untouched. Use for variants/alternatives.",
    { qasm: { type: "string" }, name: { type: "string", description: "Tab name (optional)." } },
    ["qasm"],
  ),
  t(
    "set_noise",
    "Update the noise model. Only the fields you pass change. Not on the circuit undo stack.",
    {
      enabled: { type: "boolean" },
      oneQubitDepolarising: { type: "number" },
      twoQubitDepolarising: { type: "number" },
      amplitudeDamping: { type: "number" },
      phaseDamping: { type: "number" },
      readoutBitFlip: { type: "number" },
      crosstalk: { type: "number" },
      trajectories: { type: "integer" },
    },
  ),
  t("list_tabs", "List the open circuit tabs (index, name, qubit count, which is active).", {}),
  t("switch_tab", "Switch the active tab to a given index (from list_tabs).", { index: { type: "integer" } }, ["index"]),
  t("save_as_custom_gate", "Save the current circuit as a reusable custom gate (appears in the palette).", { name: { type: "string" } }, ["name"]),
  t(
    "set_params",
    "Set the parameter-slider values for free symbols (e.g. {\"theta\": 1.57, \"t\": 0}). Only the symbols you pass change.",
    { values: { type: "object", description: "Map of symbol name → numeric value." } },
    ["values"],
  ),
  t(
    "add_plot_program",
    "Add a sandboxed code plot: a `(data) => scene` snippet that draws a custom visual. Runs in a Web Worker (no DOM/network). Use only for visuals the spec catalog can't express.",
    { code: { type: "string", description: "Body of (data)=>scene returning {width,height,elements:[…]}." } },
    ["code"],
  ),
];

/** Names that mutate the circuit (for UI labelling / gating). */
export const MUTATING_TOOLS = new Set([
  "set_circuit_qasm", "place_gate", "remove_gate", "add_qubits", "optimise", "transpile", "compile", "append_inverse",
  "prepare_state", "synthesize_unitary", "trotterise", "set_noise",
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

    case "prepare_state": {
      const qubits = clampInt(args.qubits, 0, 1, 8);
      const parsed = parseTargetState(String(args.target ?? ""), qubits);
      if (!parsed) throw new Error(`could not parse target for ${qubits} qubits (need 2^${qubits}=${1 << qubits} amplitudes or an ${qubits}-bit basis label)`);
      const out = statePrepCircuit(parsed.re, parsed.im, qubits, "state prep");
      if (!out) throw new Error("state-prep synthesis failed");
      ctx.applyCircuit(out, "AI: prepare state");
      return `Prepared the target state. ${resourceText(out)}`;
    }

    case "synthesize_unitary": {
      const n = circuit.numQubits;
      if (n < 1 || n > 4) throw new Error("unitary synthesis is capped at 4 qubits");
      const dim = 1 << n;
      const U: Cx[][] = Array.from({ length: dim }, () => Array.from({ length: dim }, () => ({ re: 0, im: 0 })));
      for (let j = 0; j < dim; j++) {
        const res = simulate(circuit, ctx.paramValues, ctx.customGates, { startIndex: j });
        if (res.isStabilizer) throw new Error("not available on the Clifford fast path");
        for (let i = 0; i < dim; i++) U[i][j] = { re: res.state[2 * i], im: res.state[2 * i + 1] };
      }
      const gates = synthesizeUnitary(U, n);
      if (!gates) throw new Error("synthesis failed");
      const out: Circuit = { numQubits: n, numClbits: 0, gates, name: "unitary synthesis" };
      ctx.applyCircuit(out, "AI: synthesize unitary");
      return `Re-synthesized the unitary into two-level gates. ${resourceText(out)}`;
    }

    case "trotterise": {
      let terms;
      try { terms = parsePauliSum(String(args.hamiltonian ?? "")); } catch (e) { throw new Error(`could not parse Hamiltonian: ${e instanceof Error ? e.message : e}`); }
      const steps = clampInt(args.steps, 1, 1, 200);
      const order = ([1, 2, 4].includes(Number(args.order)) ? Number(args.order) : 1) as TrotterOrder;
      const out = buildTrotterCircuit(terms, { steps, delta: "t", order });
      ctx.applyCircuit(out, "AI: trotterise");
      return `Built a Trotter circuit (order ${order}, ${steps} step(s), δ="t"). ${resourceText(out)}`;
    }

    case "export_circuit": {
      const fmt = String(args.format ?? "");
      const map: Record<string, () => string> = {
        qasm3: () => emitQasm3(circuit),
        qasm2: () => emitQasm2(circuit, ctx.paramValues),
        qiskit: () => emitQiskit(circuit),
        cirq: () => emitCirq(circuit),
        braket: () => emitBraket(circuit),
        qsharp: () => emitQSharp(circuit),
        pyquil: () => emitPyQuil(circuit),
        pytket: () => emitPytket(circuit),
        quantikz: () => emitQuantikz(circuit),
        stim: () => emitStim(circuit),
        json: () => JSON.stringify(circuit, null, 2),
      };
      const fn = map[fmt];
      if (!fn) throw new Error(`unknown format "${fmt}"`);
      return fn();
    }

    case "check_equivalent": {
      const parsed = parseQasm3(String(args.qasm ?? ""));
      if (!parsed.ok) throw new Error(`QASM parse error on line ${parsed.line}: ${parsed.error}`);
      const r = equivalenceCheck(circuit, parsed.circuit, ctx.customGates, ctx.customGates, ctx.paramValues);
      return `${r.equivalent ? "EQUIVALENT" : "NOT equivalent"} — process fidelity ${r.processFidelity.toFixed(6)}, max deviation ${r.maxDeviation.toFixed(6)}, trace-distance bound ${r.traceDistanceProxy.toFixed(6)}.`;
    }

    case "open_in_new_tab": {
      if (!ctx.openInNewTab) throw new Error("opening new tabs is not available here");
      const parsed = parseQasm3(String(args.qasm ?? ""));
      if (!parsed.ok) throw new Error(`QASM parse error on line ${parsed.line}: ${parsed.error}`);
      ctx.openInNewTab(parsed.circuit, typeof args.name === "string" ? args.name : "AI circuit");
      return `Opened a new tab. ${resourceText(parsed.circuit)}`;
    }

    case "set_noise": {
      if (!ctx.setNoise || !ctx.noise) throw new Error("noise control is not available here");
      const next: NoiseModel = { ...ctx.noise };
      const numKeys = ["oneQubitDepolarising", "twoQubitDepolarising", "amplitudeDamping", "phaseDamping", "readoutBitFlip", "crosstalk"] as const;
      for (const k of numKeys) if (typeof args[k] === "number") (next[k] as number) = Math.max(0, Math.min(1, args[k] as number));
      if (typeof args.enabled === "boolean") next.enabled = args.enabled;
      if (typeof args.trajectories === "number") next.trajectories = clampInt(args.trajectories, 256, 1, 8192);
      ctx.setNoise(next);
      return `Noise ${next.enabled ? "enabled" : "disabled"}: 1q=${next.oneQubitDepolarising}, 2q=${next.twoQubitDepolarising}, AD=${next.amplitudeDamping}, PD=${next.phaseDamping}, readout=${next.readoutBitFlip}, crosstalk=${next.crosstalk}, T=${next.trajectories}.`;
    }

    case "list_tabs": {
      if (!ctx.listTabs) throw new Error("tab listing is not available here");
      const tabs = ctx.listTabs();
      return tabs.map((t2) => `  [${t2.index}] ${t2.active ? "* " : "  "}${t2.name} (${t2.numQubits}q)`).join("\n") || "no tabs";
    }

    case "switch_tab": {
      if (!ctx.switchTab) throw new Error("tab switching is not available here");
      const idx = clampInt(args.index, -1, 0, 1000);
      if (!ctx.switchTab(idx)) throw new Error(`no tab at index ${idx}`);
      return `Switched to tab ${idx}.`;
    }

    case "save_as_custom_gate": {
      if (!ctx.saveCustomGate) throw new Error("saving custom gates is not available here");
      const gname = String(args.name ?? "").trim();
      if (!gname) throw new Error("name is required");
      if (circuit.gates.length === 0) throw new Error("the circuit is empty — add gates first");
      ctx.saveCustomGate(circuit, gname);
      return `Saved the current circuit as custom gate "${gname}" (${circuit.numQubits} qubits). It's in the palette under "Your gates".`;
    }

    case "set_params": {
      if (!ctx.setParams) throw new Error("setting parameters is not available here");
      const raw = args.values;
      if (!raw || typeof raw !== "object") throw new Error("values must be an object of symbol → number");
      const values: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const x = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(x)) values[k] = x;
      }
      if (Object.keys(values).length === 0) throw new Error("no valid numeric values provided");
      ctx.setParams(values);
      return `Set parameters: ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", ")}.`;
    }

    case "add_plot_program": {
      if (!ctx.addPlotProgram) throw new Error("code plots are not available here");
      const code = String(args.code ?? "");
      if (!code.trim()) throw new Error("code is required");
      ctx.addPlotProgram(code);
      return "Added a sandboxed code plot to the Custom plots panel.";
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
