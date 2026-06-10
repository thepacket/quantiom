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
  const ctx: AgentContext = {
    getCircuit: () => current,
    customGates: [],
    paramValues: {},
    applyCircuit: (next, label) => { current = next; applied.push(label); },
    addPlot: (spec) => plots.push(spec),
    openInNewTab: (c) => tabs.push(c),
    noise,
    setNoise: (n) => { noise = n; },
  };
  return { ctx, get: () => current, getNoise: () => noise, plots, tabs, applied };
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
