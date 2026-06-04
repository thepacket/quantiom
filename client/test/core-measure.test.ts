import { describe, test, expect } from "vitest";
import { mulberry32, fnv1a, measureZ, reset } from "../src/sim/measure";

describe("seeded RNG", () => {
  test("mulberry32 is deterministic for a given seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  test("mulberry32 outputs lie in [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("different seeds give different streams", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test("fnv1a is stable and varies with input", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });
});

// State layout: Float64Array length 2·2^n, re at even, im at odd.
function ket(n: number, basis: number): Float64Array {
  const s = new Float64Array(2 * (1 << n));
  s[basis * 2] = 1;
  return s;
}

describe("measureZ", () => {
  test("measuring |0⟩ always yields 0 and leaves the state", () => {
    const s = ket(1, 0);
    const out = measureZ(s, 1, 0, mulberry32(1));
    expect(out).toBe(0);
    expect(s[0]).toBeCloseTo(1, 12);
  });

  test("measuring |1⟩ always yields 1", () => {
    const s = ket(1, 1);
    expect(measureZ(s, 1, 0, mulberry32(1))).toBe(1);
  });

  test("measuring |+⟩ collapses to a normalized basis state", () => {
    const s = new Float64Array([Math.SQRT1_2, 0, Math.SQRT1_2, 0]);
    const out = measureZ(s, 1, 0, mulberry32(42));
    const norm = s[0] * s[0] + s[1] * s[1] + s[2] * s[2] + s[3] * s[3];
    expect(norm).toBeCloseTo(1, 12);
    // Post-collapse, all weight is on the measured outcome.
    expect(out === 0 || out === 1).toBe(true);
    if (out === 0) expect(s[2] * s[2] + s[3] * s[3]).toBeCloseTo(0, 12);
    else expect(s[0] * s[0] + s[1] * s[1]).toBeCloseTo(0, 12);
  });

  test("measuring |+⟩ over many seeds is roughly balanced", () => {
    let ones = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const s = new Float64Array([Math.SQRT1_2, 0, Math.SQRT1_2, 0]);
      ones += measureZ(s, 1, 0, mulberry32(i * 2654435761 >>> 0));
    }
    expect(ones / N).toBeGreaterThan(0.45);
    expect(ones / N).toBeLessThan(0.55);
  });
});

describe("reset", () => {
  test("reset forces a qubit to |0⟩", () => {
    const s = ket(1, 1);
    reset(s, 1, 0, mulberry32(1));
    expect(s[0]).toBeCloseTo(1, 12);
    expect(s[2]).toBeCloseTo(0, 12);
  });
});
