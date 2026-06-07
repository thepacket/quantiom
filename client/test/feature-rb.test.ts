import { describe, test, expect } from "vitest";
import { randomizedBenchmarking } from "../src/sim/randomizedBenchmarking";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/**
 * Run `fn` with `Math.random` temporarily replaced by a seeded generator.
 * `simulateNoisy` draws its stochastic channel samples from the global
 * `Math.random` (the `rng` option only seeds Clifford-sequence selection), so
 * without this the survival fit varies run to run and EPC comparisons flake.
 */
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

describe("randomizedBenchmarking", () => {
  test("noiseless: survival ≈ 1 at every length (recovery returns to |0⟩), epc ≈ 0", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1, oneQubitDepolarising: 0, twoQubitDepolarising: 0, readoutBitFlip: 0 };
    const r = randomizedBenchmarking(noise, { lengths: [1, 2, 4, 8, 16], sequences: 8, rng: mulberry32(1) });
    for (const s of r.survival) expect(s).toBeCloseTo(1, 6);
    expect(r.p).toBeCloseTo(1, 3);
    expect(r.epc).toBeLessThan(1e-3);
  });

  test("with depolarising noise: survival decays and EPC is positive", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 60, oneQubitDepolarising: 0.04, twoQubitDepolarising: 0, readoutBitFlip: 0 };
    const r = randomizedBenchmarking(noise, { lengths: [1, 4, 16, 48, 96], sequences: 12, rng: mulberry32(7) });
    // later lengths should have lower survival than the first
    expect(r.survival[r.survival.length - 1]).toBeLessThan(r.survival[0]);
    expect(r.p).toBeLessThan(1);
    expect(r.epc).toBeGreaterThan(0);
  });

  test("stronger noise gives a larger error-per-Clifford than weaker noise", () => {
    const base = { ...DEFAULT_NOISE, enabled: true, trajectories: 80, twoQubitDepolarising: 0, readoutBitFlip: 0 };
    const lengths = [1, 4, 16, 48];
    // Paired comparison: identical Clifford sequences (rng seed 3) AND identical
    // trajectory-noise stream (Math.random seed 123) for both runs, so the only
    // difference is the depolarising rate — the EPC ordering is deterministic.
    const weak = withSeededRandom(123, () =>
      randomizedBenchmarking({ ...base, oneQubitDepolarising: 0.01 }, { lengths, sequences: 16, rng: mulberry32(3) }));
    const strong = withSeededRandom(123, () =>
      randomizedBenchmarking({ ...base, oneQubitDepolarising: 0.06 }, { lengths, sequences: 16, rng: mulberry32(3) }));
    expect(strong.epc).toBeGreaterThan(weak.epc);
  });

  test("survival probabilities are in [0,1] and lengths align", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 20, oneQubitDepolarising: 0.02 };
    const r = randomizedBenchmarking(noise, { lengths: [1, 2, 4], sequences: 5, rng: mulberry32(2) });
    expect(r.survival).toHaveLength(3);
    for (const s of r.survival) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1); }
    expect(r.B).toBe(0.5);
    expect(r.sequences).toBe(5);
  });
});
