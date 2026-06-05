import { describe, test, expect } from "vitest";
import { parseQasm3 } from "../src/qasm/parse";
import type { Circuit, PlacedGate } from "../src/editor/types";

function ok(src: string): Circuit {
  const r = parseQasm3(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error} (line ${r.line})`);
  return r.circuit;
}
function warningsOf(src: string) {
  const r = parseQasm3(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.warnings;
}
function fail(src: string) {
  const r = parseQasm3(src);
  expect(r.ok).toBe(false);
  return r as { ok: false; error: string; line: number };
}
const find = (c: Circuit, id: string): PlacedGate | undefined => c.gates.find((g) => g.gateId === id);

describe("parseQasm3 — declarations & boilerplate", () => {
  test("ignores OPENQASM/include/input/output/const without error", () => {
    const c = ok(`OPENQASM 3.0;\ninclude "stdgates.inc";\ninput float theta;\noutput bit r;\nconst int n = 2;\nqubit[1] q;\nx q[0];`);
    expect(c.numQubits).toBe(1);
    expect(c.gates).toHaveLength(1);
  });

  test("sizes registers from qubit[N]/bit[N] and legacy qreg/creg", () => {
    expect(ok(`qubit[3] q;\nbit[2] c;`).numQubits).toBe(3);
    expect(ok(`qreg q[4];\ncreg c[1];`).numQubits).toBe(4);
    expect(ok(`qreg q[4];\ncreg c[1];`).numClbits).toBe(1);
  });
});

describe("parseQasm3 — measurement / reset / barrier / delay", () => {
  test("c[i] = measure q[j]", () => {
    const c = ok(`qubit[1] q;\nbit[1] c;\nc[0] = measure q[0];`);
    const m = find(c, "measure")!;
    expect(m.targets).toEqual([0]);
    expect(m.clbits).toEqual([0]);
  });

  test("measure with a non-qubit source fails", () => {
    expect(fail(`bit[2] c;\nc[0] = measure c[1];`).error).toMatch(/measure expects a qubit/);
  });

  test("reset accepts multiple operands", () => {
    const c = ok(`qubit[2] q;\nreset q[0], q[1];`);
    expect(c.gates.filter((g) => g.gateId === "reset")).toHaveLength(2);
  });

  test("reset on a clbit fails", () => {
    expect(fail(`bit[1] c;\nreset c[0];`).error).toMatch(/reset expects qubit/);
  });

  test("barrier with operands; bare barrier warns", () => {
    const c = ok(`qubit[2] q;\nbarrier q[0], q[1];`);
    expect(c.gates.filter((g) => g.gateId === "barrier")).toHaveLength(2);
    expect(warningsOf(`qubit[1] q;\nbarrier;`)).toEqual([
      expect.objectContaining({ message: expect.stringMatching(/without operands/) }),
    ]);
  });

  test("delay carries its duration expression (greekified)", () => {
    const c = ok(`qubit[1] q;\ndelay[pi] q[0];`);
    expect(find(c, "delay")!.params).toEqual(["π"]);
    expect(fail(`bit[1] c;\ndelay[t] c[0];`).error).toMatch(/delay expects a qubit/);
  });
});

describe("parseQasm3 — conditionals & multi-statement lines", () => {
  test("if (c[k] == v) attaches a condition to the gate", () => {
    const c = ok(`qubit[2] q;\nbit[1] c;\nif (c[0] == 1) x q[1];`);
    expect(find(c, "x")!.condition).toEqual({ clbit: 0, value: 1 });
  });

  test("multiple statements on one line both parse", () => {
    const c = ok(`qubit[2] q;\nh q[0]; x q[1];`);
    expect(c.gates.map((g) => g.gateId).sort()).toEqual(["h", "x"]);
  });
});

describe("parseQasm3 — standard gates", () => {
  test("parameterised gate with ASCII→Greek conversion", () => {
    const c = ok(`qubit[1] q;\nrx(pi/2) q[0];`);
    expect(find(c, "rx")!.params).toEqual(["π/2"]);
  });

  test("aliases: cnot→cx, toffoli→ccx, fredkin→cswap", () => {
    expect(find(ok(`qubit[2] q;\ncnot q[0], q[1];`), "cx")).toBeDefined();
    expect(find(ok(`qubit[3] q;\ntoffoli q[0], q[1], q[2];`), "ccx")).toBeDefined();
    expect(find(ok(`qubit[3] q;\nfredkin q[0], q[1], q[2];`), "cswap")).toBeDefined();
  });

  test("unknown gate name warns but does not fail the parse", () => {
    const r = parseQasm3(`qubit[1] q;\nfoobar q[0];`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings[0].message).toMatch(/unknown gate "foobar"/);
  });

  test("wrong qubit count fails", () => {
    expect(fail(`qubit[1] q;\ncx q[0];`).error).toMatch(/expects 2 qubits/);
  });

  test("a clbit operand on a unitary fails", () => {
    expect(fail(`qubit[1] q;\nbit[1] c;\nh c[0];`).error).toMatch(/expects qubit operands/);
  });

  test("a malformed register reference fails", () => {
    expect(fail(`qubit[1] q;\nh q0;`).error).toMatch(/expected register reference/);
  });
});

describe("parseQasm3 — ctrl / negctrl modifier chains", () => {
  test("ctrl @ x → cx; negctrl @ x → anti-controlled cx", () => {
    expect(find(ok(`qubit[2] q;\nctrl @ x q[0], q[1];`), "cx")!.controlStates).toBeUndefined();
    const neg = find(ok(`qubit[2] q;\nnegctrl @ x q[0], q[1];`), "cx")!;
    expect(neg.controlStates).toEqual([false]);
  });

  test("ctrl(2) @ x → ccx; ctrl(3)/(4) → fixed-arity; ctrl(5) → mcx (variable)", () => {
    expect(find(ok(`qubit[3] q;\nctrl(2) @ x q[0], q[1], q[2];`), "ccx")).toBeDefined();
    expect(find(ok(`qubit[4] q;\nctrl(3) @ x q[0], q[1], q[2], q[3];`), "c3x")).toBeDefined();
    expect(find(ok(`qubit[5] q;\nctrl(4) @ x q[0], q[1], q[2], q[3], q[4];`), "c4x")).toBeDefined();
    const mcx = find(ok(`qubit[6] q;\nctrl(5) @ x q[0], q[1], q[2], q[3], q[4], q[5];`), "mcx")!;
    expect(mcx.controls).toEqual([0, 1, 2, 3, 4]);
    expect(mcx.targets).toEqual([5]);
  });

  test("ctrl @ rz(pi) carries the parameter onto crz", () => {
    expect(find(ok(`qubit[2] q;\nctrl @ rz(pi) q[0], q[1];`), "crz")!.params).toEqual(["π"]);
  });

  test("ctrl(2) @ p → mcp; mixed ctrl @ negctrl @ x → control states [true,false]", () => {
    expect(find(ok(`qubit[3] q;\nctrl(2) @ p(pi) q[0], q[1], q[2];`), "mcp")).toBeDefined();
    const mixed = find(ok(`qubit[3] q;\nctrl @ negctrl @ x q[0], q[1], q[2];`), "ccx")!;
    expect(mixed.controlStates).toEqual([true, false]);
  });

  test("a base with no controlled IR mapping warns and is skipped", () => {
    expect(warningsOf(`qubit[2] q;\nctrl @ t q[0], q[1];`)[0].message).toMatch(/no IR mapping/);
    expect(warningsOf(`qubit[3] q;\nctrl(2) @ y q[0], q[1], q[2];`)[0].message).toMatch(/no IR mapping/);
  });

  test("a modifier chain without a base warns", () => {
    expect(warningsOf(`qubit[1] q;\nctrl @ x;`)[0].message).toMatch(/without base/);
  });

  test("a clbit operand in a modifier chain fails", () => {
    expect(fail(`qubit[1] q;\nbit[1] c;\nctrl @ x q[0], c[0];`).error).toMatch(/expects qubit operands/);
  });
});

describe("parseQasm3 — directives & annotations", () => {
  test("// qubit_names: directive populates display labels", () => {
    const c = ok(`// qubit_names: alice, bob\nqubit[2] q;\nh q[0];`);
    expect(c.qubitNames).toEqual(["alice", "bob"]);
  });

  test("// note: comment annotates the next gate", () => {
    const c = ok(`qubit[1] q;\n// note: prep step\nx q[0];`);
    expect(find(c, "x")!.annotation).toBe("prep step");
  });
});
