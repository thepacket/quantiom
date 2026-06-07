import { describe, test, expect } from "vitest";
import { pauliBudget } from "../src/sim/pauliBudget";
import { DEFAULT_NOISE } from "../src/sim/noise";

describe("pauliBudget", () => {
  test("pure depolarising: X = Y = Z = p₁/3", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, oneQubitDepolarising: 0.06, amplitudeDamping: 0, phaseDamping: 0 };
    const r = pauliBudget(noise, 2);
    for (let i = 0; i < 2; i++) {
      expect(r.pX[i]).toBeCloseTo(0.02, 12);
      expect(r.pY[i]).toBeCloseTo(0.02, 12);
      expect(r.pZ[i]).toBeCloseTo(0.02, 12);
      expect(r.total[i]).toBeCloseTo(0.06, 12);
    }
  });

  test("pure phase damping: only Z error, p_Z = (1−√(1−γ))/2", () => {
    const gamma = 0.1;
    const noise = { ...DEFAULT_NOISE, enabled: true, oneQubitDepolarising: 0, amplitudeDamping: 0, phaseDamping: gamma };
    const r = pauliBudget(noise, 1);
    expect(r.pX[0]).toBeCloseTo(0, 12);
    expect(r.pY[0]).toBeCloseTo(0, 12);
    expect(r.pZ[0]).toBeCloseTo((1 - Math.sqrt(1 - gamma)) / 2, 12);
    expect(r.phase[0]).toBeCloseTo(r.pZ[0], 12);
  });

  test("amplitude damping: p_X = p_Y = γ/4, small p_Z", () => {
    const gamma = 0.08;
    const noise = { ...DEFAULT_NOISE, enabled: true, oneQubitDepolarising: 0, amplitudeDamping: gamma, phaseDamping: 0 };
    const r = pauliBudget(noise, 1);
    expect(r.pX[0]).toBeCloseTo(gamma / 4, 12);
    expect(r.pY[0]).toBeCloseTo(gamma / 4, 12);
    expect(r.pZ[0]).toBeCloseTo((2 - 2 * Math.sqrt(1 - gamma) - gamma) / 4, 12);
    expect(r.pZ[0]).toBeGreaterThanOrEqual(0);
  });

  test("per-qubit overrides feed through; readout reported separately", () => {
    const noise = {
      ...DEFAULT_NOISE, enabled: true, oneQubitDepolarising: 0.03, readoutBitFlip: 0.01,
      perQubit: [{ oneQubitDepolarising: 0.09 }, {}],
    };
    const r = pauliBudget(noise, 2);
    expect(r.total[0]).toBeCloseTo(0.09, 12); // override
    expect(r.total[1]).toBeCloseTo(0.03, 12); // global
    expect(r.readout[0]).toBeCloseTo(0.01, 12);
  });
});
