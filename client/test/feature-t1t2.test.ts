import { describe, test, expect } from "vitest";
import { t1t2 } from "../src/sim/t1t2";
import { DEFAULT_NOISE } from "../src/sim/noise";

describe("t1t2", () => {
  test("no damping: curves stay flat (T1 = T2 = ∞)", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 1, oneQubitDepolarising: 0, amplitudeDamping: 0, phaseDamping: 0 };
    const r = t1t2(noise, { delays: [0, 8, 32, 128] });
    for (const v of r.t1Curve) expect(v).toBeCloseTo(1, 9); // P(|1⟩) stays 1
    expect(r.T1).toBe(Infinity);
    // Ramsey returns to |0⟩ each time → P(0) ≈ 1
    for (const v of r.t2Curve) expect(v).toBeCloseTo(1, 9);
  });

  test("amplitude damping: T1 finite, near the analytic −1/ln(1−γ)", () => {
    const gamma = 0.05;
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 600, amplitudeDamping: gamma, phaseDamping: 0, oneQubitDepolarising: 0 };
    const r = t1t2(noise, { delays: [0, 4, 8, 16, 24, 32, 48, 64] });
    expect(r.t1Curve[r.t1Curve.length - 1]).toBeLessThan(r.t1Curve[0]);
    const analytic = -1 / Math.log(1 - gamma);
    expect(r.T1).toBeGreaterThan(analytic * 0.6);
    expect(r.T1).toBeLessThan(analytic * 1.6);
  });

  test("stronger damping gives a shorter T1", () => {
    const base = { ...DEFAULT_NOISE, enabled: true, trajectories: 400, phaseDamping: 0, oneQubitDepolarising: 0 };
    const delays = [0, 4, 8, 16, 32, 64];
    const weak = t1t2({ ...base, amplitudeDamping: 0.02 }, { delays });
    const strong = t1t2({ ...base, amplitudeDamping: 0.08 }, { delays });
    expect(strong.T1).toBeLessThan(weak.T1);
  });

  test("phase damping decoheres the Ramsey curve (T2 finite)", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 400, phaseDamping: 0.05, amplitudeDamping: 0, oneQubitDepolarising: 0 };
    const r = t1t2(noise, { delays: [0, 4, 8, 16, 32, 64] });
    expect(r.t2Curve[r.t2Curve.length - 1]).toBeLessThan(r.t2Curve[0]);
    expect(Number.isFinite(r.T2)).toBe(true);
  });
});
