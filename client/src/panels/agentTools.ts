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
import { detectFreeVars } from "../sim/expr";
import { entropyProfile, mutualInformationMatrix } from "../sim/entanglement";
import { reducedDensityMatrix, purity } from "../sim/density";
import { magic } from "../sim/magic";
import { allPauliExpectations } from "../sim/pauliSpectrum";
import { coherenceFromAmplitudes } from "../sim/coherence";
import { randomizedBenchmarking } from "../sim/randomizedBenchmarking";
import { quantumVolume } from "../sim/quantumVolume";
import { xeb } from "../sim/xeb";
import { SNIPPETS } from "../editor/snippets";

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
  /** Reveal or collapse an analysis panel by id (window-event broadcast). */
  setPanel?: (id: string, open: boolean) => void;
  /** Close a tab by index. Returns false if the index is invalid. */
  closeTab?: (index: number) => boolean;
};

// ─── tool schemas (what the model sees) ───────────────────────────────

const t = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

const TARGET_ENUM = ["clifford-t", "ibm-heavy-hex", "rigetti"];

export const AGENT_TOOLS = [
  t("list_tools", "List every tool you can call (name + one-line description), grouped read vs mutate. Use to discover your own capabilities. Read-only.", {}),
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
    "get_free_symbols",
    "List the circuit's free parameters (symbols used in gate angle expressions, e.g. theta, phi, t) and their current slider values. Call this BEFORE set_params so you set the right symbols. Read-only.",
    {},
  ),
  t(
    "get_analysis",
    "Compute a quantum-information metric on the current circuit's output state — numbers the model cannot fabricate. `metric` ∈ entropy (entanglement-entropy profile across every cut + mid-cut value), mutual_info (per-qubit S + pairwise I(i:j)), magic (stabilizer-Rényi M₂; 0 = stabilizer/Clifford state), purity (per-qubit Tr(ρ²); 1 = unentangled), coherence (l₁ + relative-entropy coherence in the Z basis), meyer_wallach (global entanglement Q ∈ [0,1]). Read-only.",
    { metric: { type: "string", enum: ["entropy", "mutual_info", "magic", "purity", "coherence", "meyer_wallach"] } },
    ["metric"],
  ),
  t(
    "get_noise",
    "Read the current noise model (enabled flag + per-channel rates + trajectory count). Complements set_noise. Read-only.",
    {},
  ),
  t(
    "run_benchmark",
    "Run a device-characterization benchmark against the CURRENT noise model (independent of the open circuit) — compute the model cannot fabricate. `kind` ∈ rb (single-qubit randomized benchmarking → error-per-Clifford), qv (quantum volume → achieved QV + heavy-output probabilities), xeb (cross-entropy benchmarking → per-cycle fidelity λ). Bounded/sampled; runs on click. Read-only.",
    { kind: { type: "string", enum: ["rb", "qv", "xeb"] } },
    ["kind"],
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
    "insert_snippet",
    "Append a ready-made gate block to the current circuit. `id` ∈ bell, ghz, qft, iqft, trotter-ising. Builds for the circuit's current qubit count. Undo-able.",
    { id: { type: "string", enum: SNIPPETS.filter((s) => s.id).map((s) => s.id) } },
    ["id"],
  ),
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
  t("close_tab", "Close the tab at a given index (from list_tabs). Closing the last tab leaves a fresh blank one.", { index: { type: "integer" } }, ["index"]),
  t(
    "set_panel",
    "Reveal (open) or collapse an analysis panel by id so the user sees what you computed. Common ids: statevector, probabilities, bloch, expectation, custom-plots, magic, mutual-info, entropy-profile, noise, resources, qasm. No-op if the id isn't mounted.",
    { id: { type: "string" }, open: { type: "boolean", description: "true to reveal, false to collapse (default true)." } },
    ["id"],
  ),
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
  "prepare_state", "synthesize_unitary", "trotterise", "set_noise", "insert_snippet",
]);

// ─── execution ────────────────────────────────────────────────────────

const GATE_IDS = new Set(GATES.map((g) => g.id));

/** Run a tool call. Returns a short text result; throws Error on failure
 *  (the caller turns the message into a tool-result the model reads). */
export function executeTool(name: string, args: Record<string, unknown>, ctx: AgentContext): string {
  const circuit = ctx.getCircuit();
  switch (name) {
    case "list_tools": {
      const lines = AGENT_TOOLS.map((tl) => `  ${MUTATING_TOOLS.has(tl.function.name) ? "✎" : "·"} ${tl.function.name} — ${tl.function.description}`);
      return `Tools (✎ = mutates the circuit/undo-able, · = read/app):\n${lines.join("\n")}`;
    }

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

    case "get_free_symbols": {
      const syms = new Set<string>();
      for (const g of circuit.gates) for (const p of g.params ?? []) for (const v of detectFreeVars(p)) syms.add(v);
      if (syms.size === 0) return "No free symbols — the circuit has no symbolic parameters.";
      return ["Free symbols (current value):", ...[...syms].sort().map((s) => {
        const cur = ctx.paramValues[s];
        const note = s === "t" ? "  — time clock (animatable)" : "";
        return `  ${s} = ${typeof cur === "number" ? cur : 0}${note}`;
      })].join("\n");
    }

    case "get_analysis": {
      const metric = String(args.metric ?? "");
      const res = simulate(circuit, ctx.paramValues, ctx.customGates);
      if (res.isStabilizer) return "Clifford fast path — these state metrics need the statevector (the state is a stabilizer state; magic M₂ = 0 by definition).";
      const n = circuit.numQubits;
      switch (metric) {
        case "entropy": {
          const prof = entropyProfile(res.state, n);
          if (!prof) return "Entropy profile needs n ≥ 2 qubits.";
          const mid = prof.entropy[Math.floor((n - 2) / 2)];
          const cuts = prof.entropy.map((e, k) => `cut ${k}|${k + 1}: S=${Number.isFinite(e) ? e.toFixed(4) : "—"} (max ${prof.maxEntropy[k].toFixed(2)})`);
          return `Entanglement-entropy profile (bits):\n  ${cuts.join("\n  ")}\n  mid-cut S ≈ ${Number.isFinite(mid) ? mid.toFixed(4) : "—"}`;
        }
        case "mutual_info": {
          const mi = mutualInformationMatrix(res.state, n);
          if (!mi) return `Mutual information capped at 12 qubits (circuit has ${n}).`;
          const single = mi.single.map((s, q) => `S(ρ_${q})=${s.toFixed(4)}`).join(", ");
          const pairs: string[] = [];
          for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (mi.mi[i][j] > 1e-4) pairs.push(`I(${i}:${j})=${mi.mi[i][j].toFixed(4)}`);
          return `Per-qubit entropy: ${single}\nPairwise mutual information (bits): ${pairs.length ? pairs.join(", ") : "all ≈ 0 (no pairwise correlation)"}`;
        }
        case "magic": {
          const m = magic(allPauliExpectations(res.state, n), n);
          return `Stabilizer-Rényi magic M₂ = ${m.m2.toFixed(4)} bits (0 ⟺ stabilizer/Clifford state; >0 ⟺ non-Clifford resource). Pauli-weight distribution: [${m.weightDist.map((w) => w.toFixed(3)).join(", ")}].`;
        }
        case "purity": {
          const per = [];
          for (let q = 0; q < n; q++) per.push(`Tr(ρ_${q}²)=${purity(reducedDensityMatrix(res.state, n, [q])).toFixed(4)}`);
          return `Per-qubit purity (1 = pure/unentangled, 0.5 = maximally mixed): ${per.join(", ")}.`;
        }
        case "coherence": {
          const c = coherenceFromAmplitudes(res.state, n);
          return `Z-basis coherence: l₁ = ${c.cL1.toFixed(4)} (max ${c.cL1Max}), relative-entropy = ${c.cRel.toFixed(4)} bits (max ${c.cRelMax}; 0 ⟺ a classical Z-basis mixture).`;
        }
        case "meyer_wallach": {
          let sum = 0;
          for (let q = 0; q < n; q++) sum += purity(reducedDensityMatrix(res.state, n, [q]));
          const Q = Math.max(0, Math.min(1, 2 * (1 - sum / n)));
          return `Meyer–Wallach global entanglement Q = ${Q.toFixed(4)} (0 ⟺ product state, 1 ⟺ maximally entangled per the average single-qubit purity).`;
        }
        default:
          throw new Error(`unknown metric "${metric}"`);
      }
    }

    case "get_noise": {
      const nm = ctx.noise;
      if (!nm) return "Noise model is not available here.";
      return `Noise ${nm.enabled ? "ENABLED" : "disabled"} — 1q-depol=${nm.oneQubitDepolarising}, 2q-depol=${nm.twoQubitDepolarising}, amp-damp=${nm.amplitudeDamping}, phase-damp=${nm.phaseDamping}, readout=${nm.readoutBitFlip}, crosstalk=${nm.crosstalk}, trajectories=${nm.trajectories}.`;
    }

    case "run_benchmark": {
      const kind = String(args.kind ?? "");
      const nm = ctx.noise ?? { enabled: true, trajectories: 64, oneQubitDepolarising: 0.001, twoQubitDepolarising: 0.01, amplitudeDamping: 0, phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0 } as NoiseModel;
      const noiseOn: NoiseModel = { ...nm, enabled: true, trajectories: Math.min(nm.trajectories || 64, 128) };
      if (kind === "rb") {
        const r = randomizedBenchmarking(noiseOn, { lengths: [1, 2, 4, 8, 16, 32], sequences: 20 });
        return `Randomized benchmarking: depolarising p = ${r.p.toFixed(5)}, error-per-Clifford r = ${r.epc.toExponential(3)}. Survival P(m) at m=[${r.lengths.join(",")}]: [${r.survival.map((s) => s.toFixed(4)).join(", ")}].`;
      }
      if (kind === "qv") {
        const r = quantumVolume(noiseOn, { widths: [2, 3, 4], circuits: 20 });
        const rows = r.widths.map((w) => `width ${w.width}: HOP=${w.meanHOP.toFixed(3)}±${w.sigma.toFixed(3)} (2σ lower ${w.lower.toFixed(3)}) ${w.pass ? "PASS" : "fail"}`);
        return `Quantum Volume = ${r.quantumVolume} (ideal HOP ≈ ${r.idealHOP.toFixed(3)}, threshold 2/3).\n  ${rows.join("\n  ")}`;
      }
      if (kind === "xeb") {
        const r = xeb(noiseOn, { numQubits: 2, depths: [1, 2, 4, 8], circuits: 20 });
        return `Cross-entropy benchmarking (${r.numQubits}q): per-cycle fidelity λ = ${r.perCycle.toFixed(5)}. F at depths [${r.depths.join(",")}]: [${r.fidelity.map((f) => f.toFixed(4)).join(", ")}].`;
      }
      throw new Error(`kind must be one of rb, qv, xeb`);
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

    case "insert_snippet": {
      const id = String(args.id ?? "");
      const snip = SNIPPETS.find((s) => s.id === id);
      if (!snip) throw new Error(`unknown snippet "${id}" — choose from ${SNIPPETS.filter((s) => s.id).map((s) => s.id).join(", ")}`);
      const n = circuit.numQubits;
      if (n < snip.minQubits) throw new Error(`"${snip.label}" needs at least ${snip.minQubits} qubits (circuit has ${n}); add qubits first`);
      const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
      const block = snip.build(n).map((g, i) => ({ ...g, id: `ai${Date.now()}${i}`, column: g.column + maxCol + 1 }));
      ctx.applyCircuit({ ...circuit, gates: [...circuit.gates, ...block] }, `AI: insert ${snip.label}`);
      return `Inserted "${snip.label}" (${block.length} gates). ${resourceText({ ...circuit, gates: [...circuit.gates, ...block] })}`;
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

    case "close_tab": {
      if (!ctx.closeTab) throw new Error("closing tabs is not available here");
      const idx = clampInt(args.index, -1, 0, 1000);
      if (!ctx.closeTab(idx)) throw new Error(`no tab at index ${idx}`);
      return `Closed tab ${idx}.`;
    }

    case "set_panel": {
      if (!ctx.setPanel) throw new Error("panel control is not available here");
      const id = String(args.id ?? "").trim();
      if (!id) throw new Error("id is required");
      const open = args.open === undefined ? true : !!args.open;
      ctx.setPanel(id, open);
      return `${open ? "Revealed" : "Collapsed"} panel "${id}" (no-op if it isn't mounted).`;
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
