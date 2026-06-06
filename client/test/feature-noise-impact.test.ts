import { describe, test, expect } from "vitest";
import { noiseImpact, MAX_NOISE_IMPACT_QUBITS } from "../src/sim/noiseImpact";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless = (over: Partial<NoiseModel> = {}): NoiseModel => ({
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0, ...over,
});

const bell = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

describe("noiseImpact", () => {
  test("zero noise ⇒ fidelity 1, trace distance 0, purity 1, entropy 0", () => {
    const r = noiseImpact(bell, {}, [], noiseless())!;
    expect(r.numQubits).toBe(2);
    expect(r.fidelity).toBeCloseTo(1, 6);
    expect(r.traceDistance).toBeCloseTo(0, 6);
    expect(r.purity).toBeCloseTo(1, 6);
    expect(r.entropy).toBeCloseTo(0, 6);
  });

  test("disabled noise returns null", () => {
    expect(noiseImpact(bell, {}, [], { ...noiseless(), enabled: false })).toBeNull();
  });

  test("returns null past the qubit cap", () => {
    const big = circ(MAX_NOISE_IMPACT_QUBITS + 1, [gate("h", [0])]);
    expect(noiseImpact(big, {}, [], noiseless())).toBeNull();
  });

  test("metrics stay in physical ranges under noise", () => {
    const r = noiseImpact(bell, {}, [], noiseless({ oneQubitDepolarising: 0.1, twoQubitDepolarising: 0.1, trajectories: 200 }))!;
    expect(r.fidelity).toBeGreaterThanOrEqual(-1e-9);
    expect(r.fidelity).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.purity).toBeGreaterThanOrEqual(1 / 4 - 1e-6); // ≥ maximally-mixed purity
    expect(r.purity).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.traceDistance).toBeGreaterThanOrEqual(-1e-9);
    expect(r.entropy).toBeGreaterThanOrEqual(-1e-6);
  });

  test("strong noise lowers fidelity and purity, raises entropy (averaged)", () => {
    const noisy = noiseless({ oneQubitDepolarising: 0.25, twoQubitDepolarising: 0.25, trajectories: 400 });
    let f = 0, p = 0, s = 0;
    const runs = 6;
    for (let i = 0; i < runs; i++) {
      const r = noiseImpact(bell, {}, [], noisy)!;
      f += r.fidelity; p += r.purity; s += r.entropy;
    }
    f /= runs; p /= runs; s /= runs;
    expect(f).toBeLessThan(0.95);
    expect(p).toBeLessThan(0.95);
    expect(s).toBeGreaterThan(0.05);
  });
});
