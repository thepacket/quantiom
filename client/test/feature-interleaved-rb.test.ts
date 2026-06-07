import { describe, test, expect } from "vitest";
import { interleavedRb, unitarityRb, INTERLEAVED_GATES } from "../src/sim/randomizedBenchmarking";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("interleavedRb", () => {
  test("noiseless: both references survive ≈ 1 and gate error ≈ 0", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1, oneQubitDepolarising: 0 };
    const r = interleavedRb(noise, "h", { lengths: [1, 2, 4, 8], sequences: 6, rng: mulberry32(1) });
    expect(r.reference.p).toBeCloseTo(1, 3);
    expect(r.interleaved.p).toBeCloseTo(1, 3);
    expect(Math.abs(r.gateError)).toBeLessThan(5e-3);
  });

  test("with noise: both fits are valid decays and the gate error is finite", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 120, oneQubitDepolarising: 0.05 };
    const r = interleavedRb(noise, "x", { lengths: [1, 4, 16, 48], sequences: 16, rng: mulberry32(9) });
    // Both sequences decay (later survival below the first) and fit p ∈ (0,1].
    expect(r.reference.survival[r.reference.survival.length - 1]).toBeLessThan(r.reference.survival[0]);
    expect(r.interleaved.survival[r.interleaved.survival.length - 1]).toBeLessThan(r.interleaved.survival[0]);
    expect(r.reference.p).toBeGreaterThan(0);
    expect(r.reference.p).toBeLessThanOrEqual(1);
    expect(r.pInterleaved).toBeGreaterThan(0);
    expect(r.pInterleaved).toBeLessThanOrEqual(1);
    expect(Number.isFinite(r.gateError)).toBe(true);
    expect(r.bound).toBeGreaterThanOrEqual(0);
  });

  test("rejects non-Clifford / unsupported targets", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1 };
    expect(() => interleavedRb(noise, "rx", {})).toThrow();
    expect(() => interleavedRb(noise, "t", {})).toThrow(); // T not in the supported Clifford set
    expect(INTERLEAVED_GATES).toContain("h");
  });
});

describe("unitarityRb", () => {
  test("noiseless: purity stays ≈ 1 and u ≈ 1 (no decoherence)", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1, oneQubitDepolarising: 0 };
    const r = unitarityRb(noise, { lengths: [1, 2, 4, 8], sequences: 6, rng: mulberry32(2) });
    for (const q of r.purity) expect(q).toBeGreaterThan(0.98);
    expect(r.u).toBeGreaterThan(0.95);
  });

  test("depolarising noise drives purity toward 1/d and u < 1", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 80, oneQubitDepolarising: 0.08 };
    const r = unitarityRb(noise, { lengths: [1, 2, 4, 8, 12], sequences: 12, rng: mulberry32(5) });
    expect(r.purity[r.purity.length - 1]).toBeLessThan(r.purity[0]);
    expect(r.u).toBeLessThan(1);
    for (const q of r.purity) { expect(q).toBeGreaterThanOrEqual(0.5 - 1e-6); expect(q).toBeLessThanOrEqual(1 + 1e-6); }
  });
});
