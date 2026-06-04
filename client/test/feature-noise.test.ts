import { describe, test, expect } from "vitest";
import { simulateNoisy } from "../src/sim/simulateNoisy";
import { simulate } from "../src/sim/simulate";
import { DEFAULT_NOISE, rateFor, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless: NoiseModel = {
  ...DEFAULT_NOISE,
  enabled: true,
  trajectories: 1,
  oneQubitDepolarising: 0,
  twoQubitDepolarising: 0,
  amplitudeDamping: 0,
  phaseDamping: 0,
  readoutBitFlip: 0,
  crosstalk: 0,
};

const bell = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

describe("trajectory noise simulator", () => {
  test("zero-rate noise reproduces the ideal probabilities", () => {
    const ideal = simulate(bell, {});
    const noisy = simulateNoisy(bell, {}, [], noiseless);
    for (let i = 0; i < ideal.probabilities.length; i++) {
      expect(noisy.probabilities[i]).toBeCloseTo(ideal.probabilities[i], 9);
    }
    expect(noisy.isNoisy).toBe(true);
  });

  test("probabilities stay normalized under heavy depolarising noise", () => {
    const heavy: NoiseModel = { ...noiseless, trajectories: 200, oneQubitDepolarising: 0.2, twoQubitDepolarising: 0.3 };
    const r = simulateNoisy(bell, {}, [], heavy);
    const sum = r.probabilities.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    // Depolarising leaks weight into the |01⟩/|10⟩ subspace the ideal Bell
    // state never occupies.
    const leaked = r.probabilities[1] + r.probabilities[2];
    expect(leaked).toBeGreaterThan(0);
  });

  test("full depolarising drives a single qubit toward the maximally mixed state", () => {
    const c = circ(1, [gate("x", [0])]);
    const r = simulateNoisy(c, {}, [], { ...noiseless, trajectories: 4000, oneQubitDepolarising: 0.75 });
    // p = 3/4 depolarising fully randomizes ⇒ ≈ 50/50.
    expect(r.probabilities[0]).toBeGreaterThan(0.4);
    expect(r.probabilities[0]).toBeLessThan(0.6);
  });
});

describe("rateFor lookup", () => {
  test("falls back to the global rate with no per-qubit overrides", () => {
    const m: NoiseModel = { ...DEFAULT_NOISE, oneQubitDepolarising: 0.01 };
    expect(rateFor(m, "oneQubitDepolarising", 0)).toBeCloseTo(0.01, 12);
  });

  test("per-qubit override wins when present", () => {
    const m: NoiseModel = {
      ...DEFAULT_NOISE,
      oneQubitDepolarising: 0.01,
      perQubit: [{ oneQubitDepolarising: 0.5 }],
    };
    expect(rateFor(m, "oneQubitDepolarising", 0)).toBeCloseTo(0.5, 12);
    // Out-of-range qubit falls back to the global rate.
    expect(rateFor(m, "oneQubitDepolarising", 5)).toBeCloseTo(0.01, 12);
  });
});
