import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { executeTool, AGENT_TOOLS, MUTATING_TOOLS, type AgentContext } from "../src/panels/agentTools";
import type { Circuit } from "../src/editor/types";

import { DEFAULT_NOISE } from "../src/sim/noise";

function makeCtx(initial: Circuit) {
  let current = initial;
  let noise = { ...DEFAULT_NOISE };
  const plots: unknown[] = [];
  const tabs: Circuit[] = [];
  const applied: string[] = [];
  const programs: string[] = [];
  const savedGates: string[] = [];
  let params: Record<string, number> = {};
  let activeTab = 0;
  const ctx: AgentContext = {
    getCircuit: () => current,
    customGates: [],
    paramValues: {},
    applyCircuit: (next, label) => { current = next; applied.push(label); },
    addPlot: (spec) => plots.push(spec),
    openInNewTab: (c) => tabs.push(c),
    noise,
    setNoise: (n) => { noise = n; },
    listTabs: () => [{ index: 0, name: "A", numQubits: 1, active: activeTab === 0 }, { index: 1, name: "B", numQubits: 2, active: activeTab === 1 }],
    switchTab: (i) => { if (i < 0 || i > 1) return false; activeTab = i; return true; },
    saveCustomGate: (_c, name) => savedGates.push(name),
    setParams: (v) => { params = { ...params, ...v }; },
    addPlotProgram: (code) => programs.push(code),
  };
  return { ctx, get: () => current, getNoise: () => noise, plots, tabs, applied, programs, savedGates, getParams: () => params, getActiveTab: () => activeTab };
}

describe("agent tools", () => {
  it("schema is well-formed and mutating set is consistent", () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.name).toBe("string");
      expect(tool.function.parameters.type).toBe("object");
    }
    expect(MUTATING_TOOLS.has("set_circuit_qasm")).toBe(true);
    expect(MUTATING_TOOLS.has("get_resources")).toBe(false);
  });

  it("get_resources / get_state / expectation read the circuit", () => {
    const { ctx } = makeCtx(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    expect(executeTool("get_resources", {}, ctx)).toMatch(/CX=1/);
    const state = executeTool("get_state", {}, ctx);
    expect(state).toMatch(/\|00⟩/);
    expect(state).toMatch(/\|11⟩/);
    expect(executeTool("expectation", { observable: "ZZ" }, ctx)).toMatch(/⟨ZZ⟩ = 1\.0000/);
    expect(executeTool("expectation", { observable: "ZZ + XX" }, ctx)).toMatch(/⟨H⟩ = 2\.0000/);
  });

  it("place_gate / remove_gate / add_qubits mutate via applyCircuit", () => {
    const h = makeCtx(circ(1, []));
    executeTool("place_gate", { gate: "h", targets: [0] }, h.ctx);
    expect(h.get().gates.length).toBe(1);
    expect(h.get().gates[0].gateId).toBe("h");
    executeTool("place_gate", { gate: "cx", targets: [1], controls: [0] }, h.ctx);
    expect(h.get().numQubits).toBe(2); // auto-grew
    executeTool("add_qubits", { count: 2 }, h.ctx);
    expect(h.get().numQubits).toBe(4);
    const col = h.get().gates[0].column;
    executeTool("remove_gate", { column: col, target: 0 }, h.ctx);
    expect(h.get().gates.some((g) => g.gateId === "h")).toBe(false);
    expect(h.applied.length).toBeGreaterThanOrEqual(4);
  });

  it("set_circuit_qasm replaces the circuit from QASM", () => {
    const c = makeCtx(circ(1, []));
    const qasm = "OPENQASM 3;\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n";
    const out = executeTool("set_circuit_qasm", { qasm }, c.ctx);
    expect(out).toMatch(/Circuit replaced/);
    expect(c.get().numQubits).toBe(2);
    expect(c.get().gates.length).toBe(2);
  });

  it("optimise / transpile / append_inverse transform the circuit", () => {
    const o = makeCtx(circ(1, [gate("h", [0]), gate("h", [0])])); // H·H = I
    expect(executeTool("optimise", {}, o.ctx)).toMatch(/0 gates/);
    expect(o.get().gates.length).toBe(0);

    const tr = makeCtx(circ(1, [gate("t", [0])]));
    executeTool("transpile", { target: "ibm-heavy-hex" }, tr.ctx);
    expect(tr.get().gates.length).toBeGreaterThan(0);

    const inv = makeCtx(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    executeTool("append_inverse", {}, inv.ctx);
    expect(inv.get().gates.length).toBe(4); // original 2 + 2 inverse
  });

  it("prepare_state / synthesize_unitary / trotterise build circuits", () => {
    const sp = makeCtx(circ(1, []));
    executeTool("prepare_state", { target: "1, 1", qubits: 1 }, sp.ctx); // |+⟩
    expect(sp.get().gates.length).toBeGreaterThan(0);

    const us = makeCtx(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    executeTool("synthesize_unitary", {}, us.ctx);
    expect(us.get().gates.every((g) => g.gateId === "u_arb")).toBe(true);

    const tr = makeCtx(circ(1, []));
    const out = executeTool("trotterise", { hamiltonian: "0.5 Z + X", steps: 2 }, tr.ctx);
    expect(out).toMatch(/Trotter circuit/);
    expect(tr.get().gates.length).toBeGreaterThan(0);
  });

  it("export_circuit returns code; check_equivalent compares", () => {
    const { ctx } = makeCtx(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    expect(executeTool("export_circuit", { format: "qiskit" }, ctx)).toMatch(/qc\.h\(0\)/);
    expect(executeTool("export_circuit", { format: "stim" }, ctx)).toMatch(/^CX 0 1$/m);
    expect(() => executeTool("export_circuit", { format: "nope" }, ctx)).toThrow(/unknown format/);
    const same = "OPENQASM 3;\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n";
    expect(executeTool("check_equivalent", { qasm: same }, ctx)).toMatch(/EQUIVALENT/);
  });

  it("open_in_new_tab and set_noise use their callbacks", () => {
    const c = makeCtx(circ(1, []));
    executeTool("open_in_new_tab", { qasm: "OPENQASM 3;\nqubit[1] q;\nh q[0];\n" }, c.ctx);
    expect(c.tabs.length).toBe(1);
    executeTool("set_noise", { enabled: true, readoutBitFlip: 0.03 }, c.ctx);
    expect(c.getNoise().enabled).toBe(true);
    expect(c.getNoise().readoutBitFlip).toBeCloseTo(0.03, 10);
  });

  it("tranche-3: tabs, custom gate, params, plot program", () => {
    const c = makeCtx(circ(1, [gate("h", [0])]));
    expect(executeTool("list_tabs", {}, c.ctx)).toMatch(/\[0\]/);
    executeTool("switch_tab", { index: 1 }, c.ctx);
    expect(c.getActiveTab()).toBe(1);
    expect(() => executeTool("switch_tab", { index: 9 }, c.ctx)).toThrow(/no tab/);
    executeTool("save_as_custom_gate", { name: "myblock" }, c.ctx);
    expect(c.savedGates).toEqual(["myblock"]);
    executeTool("set_params", { values: { theta: 1.5, t: 0 } }, c.ctx);
    expect(c.getParams().theta).toBe(1.5);
    executeTool("add_plot_program", { code: "return {width:10,height:10,elements:[]};" }, c.ctx);
    expect(c.programs.length).toBe(1);
    expect(() => executeTool("save_as_custom_gate", { name: "" }, c.ctx)).toThrow(/name is required/);
  });

  it("get_free_symbols lists symbolic parameters with current values", () => {
    const c = makeCtx(circ(1, [gate("rz", [0], [], ["theta"]), gate("rx", [0], [], ["2*t"])]));
    c.ctx.paramValues = { theta: 1.5 };
    const out = executeTool("get_free_symbols", {}, c.ctx);
    expect(out).toMatch(/theta = 1\.5/);
    expect(out).toMatch(/t = 0/);
    expect(out).toMatch(/time clock/);
    const none = makeCtx(circ(1, [gate("h", [0])]));
    expect(executeTool("get_free_symbols", {}, none.ctx)).toMatch(/No free symbols/);
  });

  it("get_analysis computes state metrics (Bell state)", () => {
    const { ctx } = makeCtx(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    // Bell state: mid-cut entropy = 1 bit, I(0:1) = 2 bits, magic 0, Q = 1.
    expect(executeTool("get_analysis", { metric: "entropy" }, ctx)).toMatch(/S=1\.0000/);
    expect(executeTool("get_analysis", { metric: "mutual_info" }, ctx)).toMatch(/I\(0:1\)=2\.0000/);
    expect(executeTool("get_analysis", { metric: "magic" }, ctx)).toMatch(/M₂ = 0\.0000/);
    expect(executeTool("get_analysis", { metric: "purity" }, ctx)).toMatch(/Tr\(ρ_0²\)=0\.5000/);
    expect(executeTool("get_analysis", { metric: "meyer_wallach" }, ctx)).toMatch(/Q = 1\.0000/);
    expect(executeTool("get_analysis", { metric: "coherence" }, ctx)).toMatch(/l₁ =/);
    expect(() => executeTool("get_analysis", { metric: "bogus" }, ctx)).toThrow(/unknown metric/);
  });

  it("get_noise reads the model; run_benchmark characterizes it", () => {
    const c = makeCtx(circ(1, [gate("h", [0])]));
    expect(executeTool("get_noise", {}, c.ctx)).toMatch(/Noise disabled/);
    // Noiseless RB → near-perfect survival, EPC ≈ 0.
    const rb = executeTool("run_benchmark", { kind: "rb" }, c.ctx);
    expect(rb).toMatch(/error-per-Clifford/);
    expect(executeTool("run_benchmark", { kind: "qv" }, c.ctx)).toMatch(/Quantum Volume/);
    expect(executeTool("run_benchmark", { kind: "xeb" }, c.ctx)).toMatch(/per-cycle fidelity/);
    expect(() => executeTool("run_benchmark", { kind: "nope" }, c.ctx)).toThrow(/rb, qv, xeb/);
  });

  it("list_tools enumerates every tool with a mutate/read marker", () => {
    const { ctx } = makeCtx(circ(1, []));
    const out = executeTool("list_tools", {}, ctx);
    expect(out).toMatch(/get_circuit_qasm/);
    expect(out).toMatch(/✎ set_circuit_qasm/); // mutate marker
    expect(out).toMatch(/· get_state/); // read marker
    // every schema name shows up
    for (const tl of AGENT_TOOLS) expect(out).toContain(tl.function.name);
  });

  it("insert_snippet appends a named gate block", () => {
    const c = makeCtx(circ(2, []));
    const out = executeTool("insert_snippet", { id: "bell" }, c.ctx);
    expect(out).toMatch(/Bell/);
    expect(c.get().gates.length).toBe(2); // H + CX
    expect(c.get().gates.some((g) => g.gateId === "cx")).toBe(true);
    // ghz on 3 qubits → H + 2 CX
    const g3 = makeCtx(circ(3, []));
    executeTool("insert_snippet", { id: "ghz" }, g3.ctx);
    expect(g3.get().gates.length).toBe(3);
    expect(() => executeTool("insert_snippet", { id: "bell" }, makeCtx(circ(1, [])).ctx)).toThrow(/at least 2 qubits/);
    expect(() => executeTool("insert_snippet", { id: "nope" }, c.ctx)).toThrow(/unknown snippet/);
  });

  it("close_tab and set_panel use their callbacks", () => {
    let closed = -1;
    const panels: Array<{ id: string; open: boolean }> = [];
    const c = makeCtx(circ(1, []));
    c.ctx.closeTab = (i) => { if (i < 0 || i > 1) return false; closed = i; return true; };
    c.ctx.setPanel = (id, open) => { panels.push({ id, open }); };
    expect(executeTool("close_tab", { index: 1 }, c.ctx)).toMatch(/Closed tab 1/);
    expect(closed).toBe(1);
    expect(() => executeTool("close_tab", { index: 9 }, c.ctx)).toThrow(/no tab/);
    executeTool("set_panel", { id: "magic", open: true }, c.ctx);
    expect(panels).toEqual([{ id: "magic", open: true }]);
    executeTool("set_panel", { id: "noise" }, c.ctx); // open defaults true
    expect(panels[1]).toEqual({ id: "noise", open: true });
  });

  it("route inserts SWAPs against a coupling map", () => {
    // adjacency list for a line 0–1–2; a CX on 0–2 needs a SWAP to go adjacent.
    const c = makeCtx(circ(3, [gate("cx", [2], [0])]));
    c.ctx.coupling = [[1], [0, 2], [1]];
    const out = executeTool("route", {}, c.ctx);
    expect(out).toMatch(/1 SWAP/);
    expect(c.get().gates.some((g) => g.gateId === "swap")).toBe(true);
    const noMap = makeCtx(circ(2, [gate("cx", [1], [0])]));
    expect(() => executeTool("route", {}, noMap.ctx)).toThrow(/no coupling map/);
  });

  it("random_clifford builds a seeded Clifford circuit", () => {
    const cliffordIds = new Set(["h", "s", "sdg", "x", "y", "z", "sx", "sxdg", "sy", "sydg", "cx", "cz", "cy", "swap"]);
    const a = makeCtx(circ(1, []));
    executeTool("random_clifford", { qubits: 4, depth: 5, seed: 123 }, a.ctx);
    expect(a.get().numQubits).toBe(4);
    expect(a.get().gates.length).toBeGreaterThan(0);
    expect(a.get().gates.every((g) => cliffordIds.has(g.gateId))).toBe(true);
    // deterministic for a fixed seed
    const b = makeCtx(circ(1, []));
    executeTool("random_clifford", { qubits: 4, depth: 5, seed: 123 }, b.ctx);
    expect(b.get().gates.map((g) => g.gateId)).toEqual(a.get().gates.map((g) => g.gateId));
  });

  it("set_qubit_names labels qubits", () => {
    const c = makeCtx(circ(3, [gate("h", [0])]));
    const out = executeTool("set_qubit_names", { names: ["data", "ancilla", "syndrome", "extra"] }, c.ctx);
    expect(out).toMatch(/q0="data"/);
    expect(c.get().qubitNames).toEqual(["data", "ancilla", "syndrome"]); // clipped to numQubits
    expect(() => executeTool("set_qubit_names", { names: [] }, c.ctx)).toThrow(/required/);
  });

  it("reads reflect params updated by set_params within the same run", () => {
    // Regression: the agent's context used to snapshot paramValues, so reads
    // after set_params re-simulated with the stale value. A correctly-wired
    // context exposes paramValues live; verify executeTool picks up the change.
    let cur: Circuit = circ(1, [gate("ry", [0], [], ["theta"])]); // ⟨Z⟩ = cos(theta)
    let params: Record<string, number> = { theta: 0 };
    const ctx: AgentContext = {
      getCircuit: () => cur,
      customGates: [],
      get paramValues() { return params; },
      applyCircuit: (n) => { cur = n; },
      addPlot: () => {},
      setParams: (v) => { params = { ...params, ...v }; },
    };
    expect(executeTool("expectation", { observable: "Z" }, ctx)).toMatch(/⟨Z⟩ = 1\.0000/); // theta=0
    executeTool("set_params", { values: { theta: Math.PI } }, ctx);
    expect(executeTool("expectation", { observable: "Z" }, ctx)).toMatch(/⟨Z⟩ = -1\.0000/); // theta=π
    expect(executeTool("get_free_symbols", {}, ctx)).toMatch(/theta = 3\.14/);
  });

  it("add_plot forwards a spec", () => {
    const p = makeCtx(circ(1, [gate("h", [0])]));
    executeTool("add_plot", { quantity: "expZ", chart: "bars" }, p.ctx);
    expect(p.plots.length).toBe(1);
    expect((p.plots[0] as { quantity: string }).quantity).toBe("expZ");
  });

  it("reports errors as thrown messages", () => {
    const { ctx } = makeCtx(circ(2, []));
    expect(() => executeTool("place_gate", { gate: "nope", targets: [0] }, ctx)).toThrow(/unknown gate/);
    expect(() => executeTool("expectation", { observable: "Z" }, ctx)).toThrow(/length 2/);
    expect(() => executeTool("transpile", { target: "bogus" }, ctx)).toThrow(/target must be/);
    expect(() => executeTool("nonexistent_tool", {}, ctx)).toThrow(/unknown tool/);
  });
});
