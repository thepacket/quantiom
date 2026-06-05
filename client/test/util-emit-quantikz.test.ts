import { describe, test, expect } from "vitest";
import { emitQuantikz } from "../src/qasm/emitQuantikz";
import type { PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 2) => emitQuantikz(circ(nq, gates, 1));

describe("emitQuantikz — structure", () => {
  test("empty circuit comment", () => {
    expect(emitQuantikz(circ(0, []))).toBe("% empty circuit");
  });

  test("wraps rows in a quantikz environment with lstick labels", () => {
    const out = emit([gate("h", [0])]);
    expect(out).toMatch(/\\begin\{quantikz\}/);
    expect(out).toMatch(/\\lstick\{\$\\ket\{q_\{0\}\}\$\}/);
    expect(out).toMatch(/\\gate\{H\}/);
    expect(out).toMatch(/\\end\{quantikz\}/);
  });
});

describe("emitQuantikz — markers, measurement, prep", () => {
  test("barrier slice, delay, meter, basis measures, reset, init labels", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/\\qw\\slice\{\}/);
    expect(emit([gate("delay", [0], [], ["π"])])).toMatch(/\\text\{delay\}\(\\pi\)/);
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toMatch(/\\meter\{\}/);
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/\\text\{meas\}_X/);
    expect(emit([{ ...gate("measure_y", [0]), clbits: [0] }])).toMatch(/\\text\{meas\}_Y/);
    expect(emit([gate("reset", [0])])).toMatch(/\\gate\{\|0\\rangle\}/);
    expect(emit([gate("initplus", [0])])).toMatch(/\\gate\{\|\+\\rangle\}/);
    expect(emit([gate("if", [0], [], ["c==1"])])).toMatch(/\\text\{if\}/);
  });
});

describe("emitQuantikz — gate glyphs", () => {
  test("single-qubit labelled gate with params (Greek → LaTeX)", () => {
    expect(emit([gate("rz", [0], [], ["θ"])])).toMatch(/\\gate\{R_Z\(\\theta\)\}/);
  });

  test("SWAP renders \\swap + \\targX", () => {
    const out = emit([gate("swap", [0, 1])]);
    expect(out).toMatch(/\\swap\{1\}/);
    expect(out).toMatch(/\\targX\{\}/);
  });

  test("CSWAP: control + swap pair (anti-control uses \\octrl)", () => {
    const out = emit([gate("cswap", [1, 2], [0])], 3);
    expect(out).toMatch(/\\ctrl\{1\}/);
    expect(out).toMatch(/\\swap/);
    const anti = emit([{ ...gate("cswap", [1, 2], [0]), controlStates: [false] }], 3);
    expect(anti).toMatch(/\\octrl/);
  });

  test("CX family: \\ctrl + \\targ; anti-control → \\octrl", () => {
    expect(emit([gate("cx", [1], [0])])).toMatch(/\\ctrl\{1\}[\s\S]*\\targ\{\}/);
    expect(emit([gate("ccx", [2], [0, 1])], 3)).toMatch(/\\targ\{\}/);
    const anti = emit([{ ...gate("cx", [1], [0]), controlStates: [false] }]);
    expect(anti).toMatch(/\\octrl\{1\}/);
  });

  test("CZ family uses \\control{}", () => {
    expect(emit([gate("cz", [1], [0])])).toMatch(/\\control\{\}/);
    expect(emit([gate("ccz", [2], [0, 1])], 3)).toMatch(/\\control\{\}/);
  });

  test("generic controlled-target gate: \\ctrl + labelled \\gate", () => {
    const out = emit([gate("crx", [1], [0], ["a"])]);
    expect(out).toMatch(/\\ctrl\{1\}/);
    expect(out).toMatch(/\\gate\{R_X\(a\)\}/);
  });

  test("two-qubit no-control gate becomes a multi-row \\gate[n]", () => {
    expect(emit([gate("rxx", [0, 1], [], ["a"])])).toMatch(/\\gate\[2\]\{R_\{XX\}\(a\)\}/);
  });

  test("an unknown gate id is escaped into a \\gate label", () => {
    expect(emit([gate("foo_bar", [0])])).toMatch(/\\gate\{foo\\_bar\}/);
  });
});
