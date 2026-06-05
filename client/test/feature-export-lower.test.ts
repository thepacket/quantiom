/**
 * exportLower correctness — every gate that the SDK emitters lower into a
 * decomposition must be *exactly equivalent* (up to global phase) to the
 * original gate. This is the contract the six emitters rely on: if a lowered
 * sequence drifts from the gate it replaces, every export of that gate is
 * silently wrong. We verify with the full-unitary equivalence checker, which
 * factors out global phase (sy/√Y et al. are only equal up to one).
 */
import { describe, test, expect } from "vitest";
import { exportLower } from "../src/qasm/exportLower";
import { equivalenceCheck } from "../src/sim/equivalence";
import { circ, gate } from "./helpers";
import type { PlacedGate } from "../src/editor/types";

/** Lower a single placed gate and wrap original + lowering as circuits. */
function pair(n: number, g: PlacedGate) {
  const lowered = exportLower(g);
  expect(lowered).not.toBeNull();
  return {
    original: circ(n, [g]),
    lowered: circ(n, lowered!.map((x, i) => ({ ...x, column: i }))),
  };
}

function expectEquivalent(n: number, g: PlacedGate) {
  const { original, lowered } = pair(n, g);
  const r = equivalenceCheck(original, lowered, [], [], {});
  expect(r.exact).toBe(true);
  expect(r.equivalent).toBe(true);
  expect(r.processFidelity).toBeCloseTo(1, 9);
  expect(r.maxDeviation).toBeLessThan(1e-6);
}

describe("exportLower decompositions equal the original gate (up to global phase)", () => {
  test("r(θ,φ) = Rz(−φ)·Rx(θ)·Rz(φ)", () => {
    // includes φ=0 and an already-negative φ to exercise the negation helper
    // that decides how Rz(−φ) is written into the exported sub-gates.
    for (const [th, ph] of [
      ["0.7", "1.3"], ["π/3", "π/5"], ["-1.1", "2.4"], ["0", "0.9"], ["1.0", "0"], ["1.0", "-0.5"],
    ]) {
      expectEquivalent(1, gate("r", [0], [], [th, ph]));
    }
  });

  test("the negation helper produces the right literal Rz angles", () => {
    // φ = 0 → both Rz angles are "0"; already-negative φ drops the leading "-".
    expect(exportLower(gate("r", [0], [], ["0.7", "0"]))!.map((g) => g.params[0])).toEqual(["0", "0.7", "0"]);
    expect(exportLower(gate("r", [0], [], ["0.7", "-0.5"]))!.map((g) => g.params[0])).toEqual(["0.5", "0.7", "-0.5"]);
    expect(exportLower(gate("r", [0], [], ["0.7", "1.3"]))!.map((g) => g.params[0])).toEqual(["-(1.3)", "0.7", "1.3"]);
  });

  test("√Y = Ry(π/2) and √Y† = Ry(−π/2)", () => {
    expectEquivalent(1, gate("sy", [0]));
    expectEquivalent(1, gate("sydg", [0]));
  });

  test("GPi(φ) and GPi2(φ) lower through r(·,φ)", () => {
    for (const ph of ["0", "0.4", "π/2", "-1.2"]) {
      expectEquivalent(1, gate("gpi", [0], [], [ph]));
      expectEquivalent(1, gate("gpi2", [0], [], [ph]));
    }
  });

  test("MS(φ₀,φ₁,θ) = (Rz⊗Rz)·RXX(θ)·(Rz⊗Rz)†", () => {
    for (const p of [["0", "0", "π/2"], ["0.3", "1.1", "0.8"], ["-0.5", "0.9", "π/4"]]) {
      expectEquivalent(2, gate("ms", [0, 1], [], p));
    }
  });

  test("MS lowering is also correct on non-adjacent / reversed targets", () => {
    expectEquivalent(3, gate("ms", [0, 2], [], ["0.3", "1.1", "0.8"]));
    expectEquivalent(2, gate("ms", [1, 0], [], ["0.3", "1.1", "0.8"]));
  });
});

describe("exportLower returns null where there is no exact decomposition", () => {
  test("gates with a native form or no good decomposition fall through", () => {
    expect(exportLower(gate("fsim", [0, 1], [], ["0.5", "0.5"]))).toBeNull();
    expect(exportLower(gate("sqrtswap", [0, 1]))).toBeNull();
    expect(exportLower(gate("sqrtswapdg", [0, 1]))).toBeNull();
    expect(exportLower(gate("h", [0]))).toBeNull();
    expect(exportLower(gate("cx", [1], [0]))).toBeNull();
  });

  test("a controlled placement of a lowerable gate is NOT lowered", () => {
    // controlled forms aren't produced by these gates in the editor, and the
    // single-qubit decomposition would be wrong under a control.
    expect(exportLower(gate("r", [1], [0], ["0.7", "1.3"]))).toBeNull();
    expect(exportLower(gate("sy", [1], [0]))).toBeNull();
  });
});
