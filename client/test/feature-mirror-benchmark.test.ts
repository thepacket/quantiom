import { describe, test, expect } from "vitest";
import { buildMirrorCircuit, mirrorBenchmark } from "../src/sim/mirrorBenchmark";
import { simulate } from "../src/sim/simulate";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("buildMirrorCircuit", () => {
  test("ideal mirror circuit returns exactly to |0…0⟩", () => {
    for (let s = 1; s <= 5; s++) {
      const c = buildMirrorCircuit(3, 4, mulberry32(s));
      const probs = simulate(c, {}, []).probabilities;
      expect(probs[0]).toBeCloseTo(1, 9); // P(|000⟩) = 1
    }
  });
});

describe("mirrorBenchmark", () => {
  test("noiseless: success = 1 across the whole grid", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1, oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0, phaseDamping: 0, readoutBitFlip: 0 };
    const r = mirrorBenchmark(noise, { widths: [1, 2, 3], depths: [2, 4, 8], circuits: 3, rng: mulberry32(1) });
    for (const row of r.success) for (const v of row) expect(v).toBeCloseTo(1, 6);
  });

  test("with noise: deeper circuits have lower success than shallow ones", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 30, oneQubitDepolarising: 0.05 };
    const r = mirrorBenchmark(noise, { widths: [2], depths: [2, 16], circuits: 6, rng: mulberry32(4) });
    expect(r.success[0][1]).toBeLessThan(r.success[0][0]);
    for (const row of r.success) for (const v of row) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});
