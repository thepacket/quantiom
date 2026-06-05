import { describe, test, expect } from "vitest";
import { optimizeExpectation, zneFit } from "../src/sim/optimize";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless: NoiseModel = {
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0,
};
// RY(θ)|0⟩: ⟨Z⟩ = cos θ.
const ryTheta = circ(1, [gate("ry", [0], [], ["theta"])]);
const baseOpts = {
  symbols: ["theta"], observable: ["Z"] as ["Z"], initial: { theta: 2.0 },
  steps: 80, learningRate: 0.2, epsilon: 1e-4, goal: "minimize" as const,
};

describe("optimizeExpectation — optimizer variants & stopping", () => {
  test("plain SGD minimises ⟨Z⟩ toward −1", async () => {
    const res = await optimizeExpectation(ryTheta, [], { ...baseOpts, optimizer: "sgd" });
    expect(res.finalValue).toBeLessThan(-0.8);
  });

  test("QNG is disabled under noise and stops as cancelled", async () => {
    const res = await optimizeExpectation(ryTheta, [], { ...baseOpts, optimizer: "qng" }, noiseless);
    expect(res.stopped).toBe("cancelled");
    expect(res.steps).toBe(1);
  });

  test("onProgress returning false cancels after the first step", async () => {
    const res = await optimizeExpectation(ryTheta, [], {
      ...baseOpts, optimizer: "adam", onProgress: () => false,
    });
    expect(res.stopped).toBe("cancelled");
    expect(res.steps).toBe(1);
  });

  test("the noisy CPU evaluation path runs for a Pauli-sum observable", async () => {
    const res = await optimizeExpectation(
      ryTheta, [],
      { ...baseOpts, steps: 3, optimizer: "adam", observable: { kind: "sum", terms: [{ coefficient: 1, paulis: "Z" }] } },
      noiseless,
    );
    expect(Number.isFinite(res.finalValue)).toBe(true);
  });
});

describe("zneFit — fit kinds & noise scaling", () => {
  const piParams = { theta: Math.PI }; // ⟨Z⟩ = cos π = −1 at every noise scale (rates 0)

  test("quadratic fit extrapolates a constant to the ideal value", async () => {
    const r = await zneFit(ryTheta, piParams, [], ["Z"], noiseless, [1, 2, 3], "quadratic");
    expect(r.fit).toBe("quadratic");
    expect(r.extrapolated).toBeCloseTo(-1, 6);
    expect(r.samples).toHaveLength(3);
  });

  test("exponential fit returns a finite extrapolation", async () => {
    const r = await zneFit(ryTheta, piParams, [], ["Z"], noiseless, [1, 2, 3], "exponential");
    expect(r.fit).toBe("exponential");
    expect(Number.isFinite(r.extrapolated)).toBe(true);
  });

  test("scaleNoise carries per-qubit overrides through every scale", async () => {
    const withPerQubit: NoiseModel = {
      ...noiseless, oneQubitDepolarising: 0.01,
      perQubit: [{ oneQubitDepolarising: 0.02, amplitudeDamping: 0.01 }],
    };
    const r = await zneFit(ryTheta, piParams, [], ["Z"], withPerQubit, [1, 2, 3], "linear");
    expect(r.samples).toHaveLength(3);
    expect(Number.isFinite(r.extrapolated)).toBe(true);
  });
});
