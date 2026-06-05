import { describe, test, expect } from "vitest";
import { emitQasm3 } from "../src/qasm/emit";
import type { Circuit, PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 2, nc = 1) => emitQasm3(circ(nq, gates, nc));

describe("emitQasm3 — markers, measurement, prep", () => {
  test("barrier, delay, reset, plain measure", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/barrier q\[0\];/);
    expect(emit([gate("delay", [0], [], ["pi"])])).toMatch(/delay\[pi\] q\[0\];/);
    expect(emit([gate("reset", [0])])).toMatch(/reset q\[0\];/);
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toMatch(/c\[0\] = measure q\[0\];/);
  });

  test("X/Y-basis measurements expand to basis-change brackets", () => {
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/h q\[0\];[\s\S]*= measure[\s\S]*h q\[0\];/);
    expect(emit([{ ...gate("measure_y", [0]), clbits: [0] }])).toMatch(/sdg q\[0\];[\s\S]*= measure[\s\S]*s q\[0\];/);
  });

  test("every init alias and the initialize/unknown placeholders", () => {
    expect(emit([gate("init1", [0])])).toMatch(/reset q\[0\];\nx q\[0\];/);
    expect(emit([gate("initplus", [0])])).toMatch(/reset q\[0\];\nh q\[0\];/);
    expect(emit([gate("initminus", [0])])).toMatch(/reset q\[0\];\nx q\[0\];\nh q\[0\];/);
    expect(emit([gate("initiplus", [0])])).toMatch(/h q\[0\];\ns q\[0\];/);
    expect(emit([gate("initiminus", [0])])).toMatch(/h q\[0\];\nsdg q\[0\];/);
    expect(emit([gate("initialize", [0], [], ["(1,0)"])])).toMatch(/arbitrary state prep/);
  });
});

describe("emitQasm3 — control flow & arbitrary unitaries", () => {
  test("if/while/switch/box become comments", () => {
    for (const id of ["if", "while", "switch", "box"]) {
      expect(emit([gate(id, [0], [], ["c == 1"])])).toMatch(/control flow not yet exported/);
    }
  });
  test("u_arb / u_arb_2 emit an arbitrary-unitary comment", () => {
    expect(emit([gate("u_arb", [0])])).toMatch(/arbitrary unitary, not in stdgates/);
  });
  test("an unmapped gate id falls through to a comment", () => {
    expect(emit([gate("totally_made_up", [0])])).toMatch(/# .*|\/\/ totally_made_up: not yet exported/);
  });
});

describe("emitQasm3 — ctrl/negctrl modifier chains", () => {
  test("mcx emits one ctrl @ per control", () => {
    expect(emit([gate("mcx", [3], [0, 1, 2])], 4)).toMatch(/ctrl @ ctrl @ ctrl @ x q\[0\], q\[1\], q\[2\], q\[3\];/);
  });

  test("an anti-controlled cx uses negctrl @", () => {
    const g = { ...gate("cx", [1], [0]), controlStates: [false] };
    expect(emit([g])).toMatch(/negctrl @ x q\[0\], q\[1\];/);
  });

  test("mixed control states map to a ctrl @ negctrl @ chain", () => {
    const g = { ...gate("ccx", [2], [0, 1]), controlStates: [true, false] };
    expect(emit([g], 3)).toMatch(/ctrl @ negctrl @ x q\[0\], q\[1\], q\[2\];/);
  });

  test("cu drops its global-phase γ (trimParams) in the modifier form", () => {
    const g = { ...gate("cu", [1], [0], ["a", "b", "c", "d"]), controlStates: [false] };
    const out = emit([g]);
    expect(out).toMatch(/negctrl @ U\(a, b, c\) q\[0\], q\[1\];/);
    expect(out).not.toMatch(/U\(a, b, c, d\)/); // γ dropped
  });

  test("an anti-controlled gate outside the modifier table warns and clears the anti-control", () => {
    const g = { ...gate("rccx", [2], [0, 1]), controlStates: [false, true] };
    const out = emit([g], 3);
    expect(out).toMatch(/anti-controls not round-tripped/);
    expect(out).toMatch(/rccx q\[0\], q\[1\], q\[2\];/); // re-emitted without the anti-control
  });
});

describe("emitQasm3 — program structure", () => {
  test("free symbols are declared as input float", () => {
    const out = emit([gate("rx", [0], [], ["theta"])]);
    expect(out).toMatch(/input float theta;/);
  });

  test("qubit_names round-trips through a leading comment", () => {
    const c: Circuit = { numQubits: 2, numClbits: 0, gates: [gate("h", [0])], qubitNames: ["a", "b"] };
    expect(emitQasm3(c)).toMatch(/\/\/ qubit_names: a, b/);
  });

  test("a note annotation precedes its gate", () => {
    const g = { ...gate("x", [0]), annotation: "prep" };
    expect(emit([g])).toMatch(/\/\/ note: prep\nx q\[0\];/);
  });

  test("a condition wraps each emitted line in if (c[k] == v)", () => {
    const g = { ...gate("x", [0]), condition: { clbit: 0, value: 1 } };
    expect(emit([g])).toMatch(/if \(c\[0\] == 1\) x q\[0\];/);
  });

  test("register widths are declared from the circuit", () => {
    const out = emitQasm3(circ(3, [gate("h", [0])], 2));
    expect(out).toMatch(/qubit\[3\] q;/);
    expect(out).toMatch(/bit\[2\] c;/);
  });
});
