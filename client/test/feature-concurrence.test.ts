import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { concurrence, concurrenceMatrix } from "../src/sim/concurrence";
import { reducedDensityMatrix, type Complex } from "../src/sim/density";
import { circ, gate } from "./helpers";

const mat = (n: number, gates: ReturnType<typeof gate>[]) =>
  concurrenceMatrix(simulate(circ(n, gates), {}, []).state, n)!;

describe("concurrence (single pair)", () => {
  const bell: Complex[][] = [
    [{ re: 0.5, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }],
    [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }],
    [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }],
    [{ re: 0.5, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.5, im: 0 }],
  ];

  test("Bell state has concurrence 1", () => {
    expect(concurrence(bell)).toBeCloseTo(1, 6);
  });

  test("product |00⟩ has concurrence 0", () => {
    const rho: Complex[][] = Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => ({ re: i === 0 && j === 0 ? 1 : 0, im: 0 })));
    expect(concurrence(rho)).toBeCloseTo(0, 9);
  });

  test("maximally mixed I/4 has concurrence 0", () => {
    const rho: Complex[][] = Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => ({ re: i === j ? 0.25 : 0, im: 0 })));
    expect(concurrence(rho)).toBeCloseTo(0, 9);
  });
});

describe("concurrenceMatrix (pure states)", () => {
  test("Bell pair: C(0,1) = 1", () => {
    const r = mat(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
    expect(r.c[0][1]).toBeCloseTo(1, 6);
    expect(r.c[1][0]).toBeCloseTo(1, 6);
    expect(r.max).toBeCloseTo(1, 6);
  });

  test("product state: all pairwise concurrences 0", () => {
    const r = mat(3, [gate("h", [0]), gate("x", [2])]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(r.c[i][j]).toBeCloseTo(0, 8);
    expect(r.max).toBeCloseTo(0, 8);
  });

  test("GHZ_3: every pair has concurrence 0 (entanglement is global, not pairwise)", () => {
    const r = mat(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]);
    expect(r.c[0][1]).toBeCloseTo(0, 6);
    expect(r.c[0][2]).toBeCloseTo(0, 6);
    expect(r.c[1][2]).toBeCloseTo(0, 6);
  });

  test("W_3: every pair has concurrence 2/3 (monogamy-saturating)", () => {
    // |W⟩ = (|001⟩+|010⟩+|100⟩)/√3 via a standard prep.
    // Build it directly through amplitudes using initialize would be cleaner,
    // but a tested explicit prep: use ry/cry cascade. Instead verify on the
    // exact statevector constructed by hand.
    const n = 3;
    const dim = 1 << n;
    const st = new Float64Array(2 * dim);
    const amp = 1 / Math.sqrt(3);
    for (const idx of [0b001, 0b010, 0b100]) st[2 * idx] = amp;
    const r = concurrenceMatrix(st, n)!;
    expect(r.c[0][1]).toBeCloseTo(2 / 3, 6);
    expect(r.c[0][2]).toBeCloseTo(2 / 3, 6);
    expect(r.c[1][2]).toBeCloseTo(2 / 3, 6);
  });

  test("returns null below 2 qubits or above the cap", () => {
    expect(concurrenceMatrix(new Float64Array(2), 1)).toBeNull();
    const big = new Float64Array(2 * (1 << 11));
    expect(concurrenceMatrix(big, 11)).toBeNull();
  });

  test("symmetric with zero diagonal", () => {
    const r = mat(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
    for (let i = 0; i < 3; i++) expect(r.c[i][i]).toBe(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(r.c[i][j]).toBeCloseTo(r.c[j][i], 9);
  });
});
