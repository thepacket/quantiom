import { describe, test, expect } from "vitest";
import { emitQSharp } from "../src/qasm/emitQSharp";
import type { PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 2, nc = 1) => emitQSharp(circ(nq, gates, nc));

describe("emitQSharp — program scaffold", () => {
  test("opens namespaces, allocates qubits, sizes results, resets and returns", () => {
    const out = emit([gate("h", [0])]);
    expect(out).toMatch(/open Microsoft\.Quantum\.Intrinsic;/);
    expect(out).toMatch(/operation Main\(\) : Result\[\]/);
    expect(out).toMatch(/use qs = Qubit\[2\];/);
    expect(out).toMatch(/mutable results = \[Zero, size = 1\];/);
    expect(out).toMatch(/ResetAll\(qs\);/);
    expect(out).toMatch(/return results;/);
  });

  test("free symbols become Double operation parameters", () => {
    expect(emit([gate("rx", [0], [], ["theta"])])).toMatch(/operation Main\(theta : Double\) : Result\[\]/);
  });

  test("results array is sized to at least 1 even with no clbits", () => {
    expect(emitQSharp(circ(1, [gate("h", [0])], 0))).toMatch(/size = 1/);
  });
});

describe("emitQSharp — markers, measurement, prep", () => {
  test("barrier/delay comments, measure, reset", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/\/\/ barrier/);
    expect(emit([gate("delay", [0], [], ["pi"])])).toMatch(/\/\/ delay\(PI\(\)\)/);
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toMatch(/set results w\/= 0 <- M\(qs\[0\]\);/);
    expect(emit([gate("reset", [0])])).toMatch(/Reset\(qs\[0\]\);/);
  });

  test("X/Y-basis measurements bracket M with basis changes", () => {
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/H\(qs\[0\]\);[\s\S]*<- M[\s\S]*H\(qs\[0\]\);/);
    expect(emit([{ ...gate("measure_y", [0]), clbits: [0] }])).toMatch(/Adjoint S\(qs\[0\]\);[\s\S]*S\(qs\[0\]\);/);
  });

  test("init aliases", () => {
    expect(emit([gate("init1", [0])])).toMatch(/Reset\(qs\[0\]\);\n {4}X\(qs\[0\]\);/);
    expect(emit([gate("initiminus", [0])])).toMatch(/H\(qs\[0\]\);\n {4}Adjoint S\(qs\[0\]\);/);
  });
});

describe("emitQSharp — gate mappings", () => {
  test("fixed single-qubit gates (incl. adjoints and √X)", () => {
    expect(emit([gate("x", [0])])).toMatch(/X\(qs\[0\]\);/);
    expect(emit([gate("sdg", [0])])).toMatch(/Adjoint S\(qs\[0\]\);/);
    expect(emit([gate("tdg", [0])])).toMatch(/Adjoint T\(qs\[0\]\);/);
    expect(emit([gate("sx", [0])])).toMatch(/Rx\(PI\(\)\/2\.0, qs\[0\]\);/);
    expect(emit([gate("sxdg", [0])])).toMatch(/Rx\(-PI\(\)\/2\.0, qs\[0\]\);/);
  });

  test("rotations, phase, and the U decomposition", () => {
    expect(emit([gate("rz", [0], [], ["0.5"])])).toMatch(/Rz\(0\.5, qs\[0\]\);/);
    expect(emit([gate("p", [0], [], ["0.5"])])).toMatch(/R1\(0\.5, qs\[0\]\);/);
    expect(emit([gate("u3", [0], [], ["a", "b", "c"])])).toMatch(/Rz\(c, qs\[0\]\);[\s\S]*Ry\(a, qs\[0\]\);[\s\S]*Rz\(b, qs\[0\]\);/);
  });

  test("two- and three-qubit gates", () => {
    expect(emit([gate("cx", [1], [0])])).toMatch(/CNOT\(qs\[0\], qs\[1\]\);/);
    expect(emit([gate("cy", [1], [0])])).toMatch(/Controlled Y\(\[qs\[0\]\], qs\[1\]\);/);
    expect(emit([gate("swap", [0, 1])])).toMatch(/SWAP\(qs\[0\], qs\[1\]\);/);
    expect(emit([gate("rzz", [0, 1], [], ["a"])])).toMatch(/Rzz\(a, qs\[0\], qs\[1\]\);/);
    expect(emit([gate("ccx", [2], [0, 1])], 3)).toMatch(/CCNOT\(qs\[0\], qs\[1\], qs\[2\]\);/);
    expect(emit([gate("cswap", [1, 2], [0])], 3)).toMatch(/Controlled SWAP\(\[qs\[0\]\], \(qs\[1\], qs\[2\]\)\);/);
    expect(emit([gate("mcx", [3], [0, 1, 2])], 4)).toMatch(/Controlled X\(\[qs\[0\], qs\[1\], qs\[2\]\], qs\[3\]\);/);
  });

  test("a gate with no Q# mapping falls through to a comment", () => {
    expect(emit([gate("dcx", [0, 1])])).toMatch(/\/\/ dcx: no direct Q# mapping/);
  });
});
