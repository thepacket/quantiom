import { describe, test, expect } from "vitest";
import { buildRepDecoder, repetitionExact, repetitionLogicalErrorRate, qecSweep } from "../src/sim/qec";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("repetition-code exact logical error rate", () => {
  test("d=3: P_L = 3p² − 2p³, equals ½ at the threshold p=½", () => {
    expect(repetitionExact(3, 0.5)).toBeCloseTo(0.5, 9);
    expect(repetitionExact(3, 0.1)).toBeCloseTo(3 * 0.01 - 2 * 0.001, 9);
    expect(repetitionExact(3, 0)).toBeCloseTo(0, 9);
  });

  test("below threshold a larger distance protects better; at ½ all equal", () => {
    expect(repetitionExact(5, 0.1)).toBeLessThan(repetitionExact(3, 0.1));
    expect(repetitionExact(7, 0.1)).toBeLessThan(repetitionExact(5, 0.1));
    expect(repetitionExact(3, 0.5)).toBeCloseTo(0.5, 6);
    expect(repetitionExact(7, 0.5)).toBeCloseTo(0.5, 6);
  });

  test("above threshold a larger distance is WORSE (curves cross at ½)", () => {
    expect(repetitionExact(7, 0.7)).toBeGreaterThan(repetitionExact(3, 0.7));
  });
});

describe("syndrome lookup decoder", () => {
  test("d=3 single-qubit errors decode to themselves (min weight)", () => {
    const t = buildRepDecoder(3);
    // e=001 → syndrome (e0^e1, e1^e2) = (1,0) = 0b01
    expect(t[0b01]).toBe(0b001);
    // e=100 → (0,1) = 0b10
    expect(t[0b10]).toBe(0b100);
    // e=010 → (1,1) = 0b11
    expect(t[0b11]).toBe(0b010);
    // trivial syndrome → no correction
    expect(t[0]).toBe(0);
  });
});

describe("Monte-Carlo decode matches the exact rate", () => {
  test("d=3 and d=5 within sampling tolerance", () => {
    const tol = 0.015;
    for (const d of [3, 5]) {
      for (const p of [0.05, 0.15, 0.3]) {
        const mc = repetitionLogicalErrorRate(d, p, 40000, mulberry32(d * 100 + Math.round(p * 100)));
        expect(Math.abs(mc - repetitionExact(d, p))).toBeLessThan(tol);
      }
    }
  });
});

describe("qecSweep", () => {
  test("threshold ≈ 0.5 and shapes are sane", () => {
    const r = qecSweep({ distances: [3, 5, 7], shots: 3000, rng: mulberry32(1) });
    expect(r.threshold).toBeCloseTo(0.5, 1);
    expect(r.logical).toHaveLength(3);
    expect(r.logical[0]).toHaveLength(r.pValues.length);
    // first p is ~0 → near-zero logical error; last p (0.6) → high
    expect(r.logical[0][0]).toBeLessThan(0.05);
  });

  test("exact mode is deterministic and monotone-ish", () => {
    const r = qecSweep({ distances: [3], pValues: [0, 0.1, 0.25, 0.4], exact: true });
    expect(r.logical[0][0]).toBe(0);
    expect(r.logical[0][3]).toBeGreaterThan(r.logical[0][1]);
  });
});
