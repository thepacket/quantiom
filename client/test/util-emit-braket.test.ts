import { describe, test, expect } from "vitest";
import { emitBraket } from "../src/qasm/emitBraket";
import type { PlacedGate } from "../src/editor/types";
import { circ, gate } from "./helpers";

const emit = (gates: PlacedGate[], nq = 2, nc = 1) => emitBraket(circ(nq, gates, nc));

describe("emitBraket — scaffold & IonQ natives", () => {
  test("imports, Circuit(), and FreeParameter declarations", () => {
    const out = emit([gate("rx", [0], [], ["theta"])]);
    expect(out).toMatch(/from braket\.circuits import Circuit, FreeParameter/);
    expect(out).toMatch(/theta = FreeParameter\("theta"\)/);
    expect(out).toMatch(/circuit = Circuit\(\)/);
  });

  test("gpi / gpi2 / ms emit natively (not via exportLower)", () => {
    expect(emit([gate("gpi", [0], [], ["a"])])).toMatch(/circuit\.gpi\(0, a\)/);
    expect(emit([gate("gpi2", [0], [], ["a"])])).toMatch(/circuit\.gpi2\(0, a\)/);
    expect(emit([gate("ms", [0, 1], [], ["a", "b", "c"])])).toMatch(/circuit\.ms\(0, 1, a, b, c\)/);
  });

  test("R(θ,φ) lowers through exportLower to rz/rx/rz", () => {
    expect(emit([gate("r", [0], [], ["a", "b"])])).toMatch(/circuit\.rz\([\s\S]*circuit\.rx\(0, a\)[\s\S]*circuit\.rz/);
  });
});

describe("emitBraket — markers, measurement, prep (comments)", () => {
  test("barrier/delay/measure/reset notes", () => {
    expect(emit([gate("barrier", [0])])).toMatch(/# barrier/);
    expect(emit([gate("delay", [0], [], ["pi"])])).toMatch(/# delay\(pi\)/);
    expect(emit([{ ...gate("measure", [0]), clbits: [0] }])).toMatch(/measurement is implicit in Braket/);
    expect(emit([{ ...gate("measure_x", [0]), clbits: [0] }])).toMatch(/basis-change measure not modelled/);
    expect(emit([gate("reset", [0])])).toMatch(/reset not natively supported/);
  });

  test("init aliases", () => {
    expect(emit([gate("init0", [0])])).toMatch(/# init \|0⟩ on q0/);
    expect(emit([gate("init1", [0])])).toMatch(/circuit\.x\(0\)/);
    expect(emit([gate("initiminus", [0])])).toMatch(/circuit\.h\(0\)[\s\S]*circuit\.si\(0\)/);
  });
});

describe("emitBraket — gate mappings", () => {
  test("fixed single-qubit names (si/ti/v/vi)", () => {
    expect(emit([gate("sdg", [0])])).toMatch(/circuit\.si\(0\)/);
    expect(emit([gate("tdg", [0])])).toMatch(/circuit\.ti\(0\)/);
    expect(emit([gate("sx", [0])])).toMatch(/circuit\.v\(0\)/);
    expect(emit([gate("sxdg", [0])])).toMatch(/circuit\.vi\(0\)/);
  });

  test("rotations (target-first arg order), phaseshift, U decomposition", () => {
    expect(emit([gate("rx", [0], [], ["0.5"])])).toMatch(/circuit\.rx\(0, 0\.5\)/);
    expect(emit([gate("p", [0], [], ["0.5"])])).toMatch(/circuit\.phaseshift\(0, 0\.5\)/);
    expect(emit([gate("u3", [0], [], ["a", "b", "c"])])).toMatch(/circuit\.rz\(0, c\)[\s\S]*circuit\.ry\(0, a\)[\s\S]*circuit\.rz\(0, b\)/);
  });

  test("two-/three-qubit gates and cphaseshift", () => {
    expect(emit([gate("cx", [1], [0])])).toMatch(/circuit\.cnot\(0, 1\)/);
    expect(emit([gate("iswap", [0, 1])])).toMatch(/circuit\.iswap\(0, 1\)/);
    expect(emit([gate("ecr", [0, 1])])).toMatch(/circuit\.ecr\(0, 1\)/);
    expect(emit([gate("rxx", [0, 1], [], ["a"])])).toMatch(/circuit\.xx\(0, 1, a\)/);
    expect(emit([gate("ccx", [2], [0, 1])], 3)).toMatch(/circuit\.ccnot\(0, 1, 2\)/);
    expect(emit([gate("cswap", [1, 2], [0])], 3)).toMatch(/circuit\.cswap\(0, 1, 2\)/);
    expect(emit([gate("cp", [1], [0], ["a"])])).toMatch(/circuit\.cphaseshift\(0, 1, a\)/);
  });

  test("a gate with no Braket mapping falls through to a comment", () => {
    expect(emit([gate("dcx", [0, 1])])).toMatch(/# dcx: no direct Braket mapping/);
  });
});
