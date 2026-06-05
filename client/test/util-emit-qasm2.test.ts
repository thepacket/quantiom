import { describe, test, expect } from "vitest";
import { emitQasm2 } from "../src/qasm/emitQasm2";
import type { Circuit, PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 2, nc = 1, params = {}) =>
  emitQasm2(circ(nq, gates, nc), params);

describe("emitQasm2 — header & registers", () => {
  test("declares OPENQASM 2.0, qelib1, qreg/creg", () => {
    const out = emit([gate("h", [0])]);
    expect(out).toMatch(/OPENQASM 2\.0;/);
    expect(out).toMatch(/include "qelib1\.inc";/);
    expect(out).toMatch(/qreg q\[2\];/);
    expect(out).toMatch(/creg c\[1\];/);
  });

  test("no clbits ⇒ no creg line", () => {
    expect(emitQasm2(circ(1, [gate("h", [0])], 0))).not.toMatch(/creg/);
  });
});

describe("emitQasm2 — markers, measurement, prep", () => {
  test("barrier, delay comment, arrow-form measure, reset", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/barrier q\[0\];/);
    expect(emit([gate("delay", [0], [], ["pi"])])).toMatch(/\/\/ delay\(pi\).*not in OpenQASM 2/);
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toMatch(/measure q\[0\] -> c\[0\];/);
    expect(emit([gate("reset", [0])])).toMatch(/reset q\[0\];/);
  });

  test("X/Y-basis measurements", () => {
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/h q\[0\];[\s\S]*measure[\s\S]*h q\[0\];/);
    expect(emit([{ ...gate("measure_y", [0]), clbits: [0] }])).toMatch(/sdg q\[0\];[\s\S]*s q\[0\];/);
  });

  test("init aliases, initialize comment, unknown init", () => {
    expect(emit([gate("init1", [0])])).toMatch(/reset q\[0\];\nx q\[0\];/);
    expect(emit([gate("initiminus", [0])])).toMatch(/h q\[0\];\nsdg q\[0\];/);
    expect(emit([gate("initialize", [0], [], ["(1,0)"])])).toMatch(/arbitrary state prep not in qelib1/);
  });
});

describe("emitQasm2 — unsupported constructs become comments", () => {
  test("control flow, anti-controls, u_arb, off-library gates", () => {
    expect(emit([gate("if", [0], [], ["c==1"])])).toMatch(/control flow not exported in OpenQASM 2/);
    const anti = { ...gate("cx", [1], [0]), controlStates: [false] };
    expect(emit([anti])).toMatch(/anti-controls not expressible in OpenQASM 2/);
    expect(emit([gate("u_arb", [0])])).toMatch(/arbitrary unitary, not in qelib1/);
    expect(emit([gate("iswap", [0, 1])])).toMatch(/\/\/ iswap: not in qelib1\.inc/);
  });
});

describe("emitQasm2 — numeric parameter binding", () => {
  test("integers stay integers; floats are precision-trimmed", () => {
    expect(emit([gate("rz", [0], [], ["2"])])).toMatch(/rz\(2\) q\[0\];/);
    expect(emit([gate("rx", [0], [], ["pi/2"])])).toMatch(/rx\(1\.570796327\) q\[0\];/);
  });

  test("free symbols are bound from paramValues and recorded in a header comment", () => {
    const out = emit([gate("ry", [0], [], ["theta"])], 2, 1, { theta: 0.5 });
    expect(out).toMatch(/free parameters bound to current values: theta=0\.5/);
    expect(out).toMatch(/ry\(0\.5\) q\[0\];/);
  });

  test("a non-finite parameter falls back to 0", () => {
    // An unbound free symbol with no paramValues evaluates to NaN ⇒ "0".
    expect(emit([gate("rz", [0], [], ["alpha"])])).toMatch(/rz\(0\) q\[0\];/);
  });
});

describe("emitQasm2 — conditions", () => {
  test("a width-1 creg condition translates to if (c == v)", () => {
    const g = { ...gate("x", [0]), condition: { clbit: 0, value: 1 } };
    expect(emitQasm2(circ(2, [g], 1))).toMatch(/if \(c == 1\) x q\[0\];/);
  });

  test("a multi-bit creg single-bit condition warns and drops the wrap", () => {
    const g = { ...gate("x", [0]), condition: { clbit: 0, value: 1 } };
    const out = emitQasm2(circ(2, [g], 2));
    expect(out).toMatch(/single-bit conditions not expressible in QASM 2 with multi-bit creg/);
    expect(out).toMatch(/^x q\[0\];$/m); // emitted unwrapped
  });
});
