import { describe, test, expect } from "vitest";
import { haarSU4, buildQvCircuit, quantumVolume } from "../src/sim/quantumVolume";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("haarSU4", () => {
  test("returns a 4×4 unitary (U U† = I)", () => {
    const rng = mulberry32(42);
    const U = haarSU4(rng); // 32 floats, row-major re/im
    const N = 4;
    const get = (r: number, c: number): [number, number] => [U[(r * N + c) * 2], U[(r * N + c) * 2 + 1]];
    // (U U†)_{ij} = Σ_k U_ik conj(U_jk)
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < N; k++) {
        const [ar, ai] = get(i, k);
        const [br, bi] = get(j, k);
        re += ar * br + ai * bi;
        im += ai * br - ar * bi;
      }
      expect(re).toBeCloseTo(i === j ? 1 : 0, 9);
      expect(im).toBeCloseTo(0, 9);
    }
  });
});

describe("buildQvCircuit", () => {
  test("width m has m qubits and m layers of SU(4) pairs", () => {
    const c = buildQvCircuit(4, mulberry32(1));
    expect(c.numQubits).toBe(4);
    // 4 layers × 2 pairs = 8 SU(4) gates
    expect(c.gates.filter((g) => g.gateId === "u_arb_2")).toHaveLength(8);
  });
});

describe("quantumVolume", () => {
  test("clean model: HOP ≈ ideal and beats the noisy model; QV is 1 or a power of two", () => {
    const clean = { ...DEFAULT_NOISE, enabled: false };
    const r = quantumVolume(clean, { widths: [2, 3], circuits: 12, rng: mulberry32(3) });
    expect(r.idealHOP).toBeCloseTo((1 + Math.log(2)) / 2, 6);
    for (const w of r.widths) expect(w.meanHOP).toBeGreaterThan(0.6);
    // QV is 1 or 2^k
    expect(Number.isInteger(Math.log2(r.quantumVolume))).toBe(true);
  });

  test("strong noise lowers the heavy-output probability", () => {
    const clean = { ...DEFAULT_NOISE, enabled: false };
    const noisy = { ...DEFAULT_NOISE, enabled: true, trajectories: 30, twoQubitDepolarising: 0.15, oneQubitDepolarising: 0.05 };
    const c = quantumVolume(clean, { widths: [3], circuits: 10, rng: mulberry32(7) });
    const n = quantumVolume(noisy, { widths: [3], circuits: 10, rng: mulberry32(7) });
    expect(n.widths[0].meanHOP).toBeLessThan(c.widths[0].meanHOP + 1e-9);
  });
});
