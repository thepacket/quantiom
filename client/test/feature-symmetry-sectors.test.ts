import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { symmetrySectors } from "../src/sim/symmetrySectors";
import { circ, gate } from "./helpers";

const sectorsOf = (n: number, gates: ReturnType<typeof gate>[]) => {
  const res = simulate(circ(n, gates), {}, []);
  return symmetrySectors(res.probabilities, n);
};

describe("symmetrySectors", () => {
  test("|0…0⟩ sits entirely in the k=0 sector", () => {
    const r = sectorsOf(3, []);
    expect(r.weightSectors).toHaveLength(4);
    expect(r.weightSectors[0]).toBeCloseTo(1, 9);
    expect(r.numberConserved).toBe(true);
    expect(r.parityConserved).toBe(true);
    expect(r.parityEven).toBeCloseTo(1, 9);
    expect(r.parityExpectation).toBeCloseTo(1, 9);
  });

  test("X on one qubit moves all weight to k=1 (odd parity)", () => {
    const r = sectorsOf(3, [gate("x", [0])]);
    expect(r.weightSectors[1]).toBeCloseTo(1, 9);
    expect(r.numberConserved).toBe(true);
    expect(r.parityOdd).toBeCloseTo(1, 9);
    expect(r.parityExpectation).toBeCloseTo(-1, 9);
  });

  test("iSWAP conserves excitation number (one excitation stays in k=1)", () => {
    // Prepare |10⟩ then iSWAP → stays within the single-excitation sector.
    const r = sectorsOf(2, [gate("x", [0], [], [], 0), gate("iswap", [0, 1], [], [], 1)]);
    expect(r.weightSectors[0]).toBeCloseTo(0, 9);
    expect(r.weightSectors[1]).toBeCloseTo(1, 9);
    expect(r.weightSectors[2]).toBeCloseTo(0, 9);
    expect(r.numberConserved).toBe(true);
  });

  test("Hadamard breaks number conservation but keeps probabilities normalised", () => {
    const r = sectorsOf(2, [gate("h", [0]), gate("h", [1])]);
    // |++⟩ spreads over k = 0,1,2 with weights 1/4, 1/2, 1/4.
    expect(r.weightSectors[0]).toBeCloseTo(0.25, 9);
    expect(r.weightSectors[1]).toBeCloseTo(0.5, 9);
    expect(r.weightSectors[2]).toBeCloseTo(0.25, 9);
    expect(r.numberConserved).toBe(false);
    expect(r.numOccupiedSectors).toBe(3);
    // Even parity = k0 + k2 = 0.5, odd = k1 = 0.5 ⇒ ⟨ΠZ⟩ = 0.
    expect(r.parityExpectation).toBeCloseTo(0, 9);
  });

  test("GHZ_4 conserves parity but not particle number (even N)", () => {
    const r = sectorsOf(4, [
      gate("h", [0], [], [], 0),
      gate("cx", [1], [0], [], 1),
      gate("cx", [2], [1], [], 2),
      gate("cx", [3], [2], [], 3),
    ]);
    // weight on k=0 (|0000⟩) and k=4 (|1111⟩), each 1/2 — both even parity.
    expect(r.weightSectors[0]).toBeCloseTo(0.5, 9);
    expect(r.weightSectors[4]).toBeCloseTo(0.5, 9);
    expect(r.numberConserved).toBe(false);
    expect(r.parityConserved).toBe(true);
    expect(r.parityEven).toBeCloseTo(1, 9);
  });

  test("GHZ_3 is parity-mixed (odd N: k=0 even, k=3 odd)", () => {
    const r = sectorsOf(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]);
    expect(r.weightSectors[0]).toBeCloseTo(0.5, 9);
    expect(r.weightSectors[3]).toBeCloseTo(0.5, 9);
    expect(r.parityConserved).toBe(false);
    expect(r.parityExpectation).toBeCloseTo(0, 9);
  });

  test("weights sum to 1 and sectors total n+1", () => {
    const r = sectorsOf(4, [gate("h", [0]), gate("ry", [2], [], ["0.7"])]);
    expect(r.weightSectors).toHaveLength(5);
    const total = r.weightSectors.reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(r.parityEven + r.parityOdd).toBeCloseTo(1, 9);
  });

  test("works on a raw probability array (mixed-state diagonal)", () => {
    // A maximally mixed 2-qubit diagonal: k=0,1,1,2 → weights .25,.5,.25.
    const r = symmetrySectors([0.25, 0.25, 0.25, 0.25], 2);
    expect(r.weightSectors[0]).toBeCloseTo(0.25, 9);
    expect(r.weightSectors[1]).toBeCloseTo(0.5, 9);
    expect(r.weightSectors[2]).toBeCloseTo(0.25, 9);
    expect(r.parityExpectation).toBeCloseTo(0, 9);
  });
});
