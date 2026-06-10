import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { executeTool, AGENT_TOOLS, MUTATING_TOOLS, type AgentContext } from "../src/panels/agentTools";
import type { Circuit } from "../src/editor/types";

function makeCtx(initial: Circuit) {
  let current = initial;
  const plots: unknown[] = [];
  const applied: string[] = [];
  const ctx: AgentContext = {
    getCircuit: () => current,
    customGates: [],
    paramValues: {},
    applyCircuit: (next, label) => { current = next; applied.push(label); },
    addPlot: (spec) => plots.push(spec),
  };
  return { ctx, get: () => current, plots, applied };
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
