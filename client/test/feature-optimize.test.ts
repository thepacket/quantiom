import { describe, test, expect } from "vitest";
import { optimizeExpectation, zneFit, computeLandscape, barrenPlateauDiagnostic } from "../src/sim/optimize";
import { sampleShots } from "../src/sim/sample";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless: NoiseModel = {
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0,
};
// RY(θ)|0⟩: ⟨Z⟩ = cos θ.
const ryTheta = circ(1, [gate("ry", [0], [], ["theta"])]);

describe("parameter-shift optimizer (CPU path)", () => {
  test("minimizing ⟨Z⟩ over RY(θ)|0⟩ converges to θ ≈ π, ⟨Z⟩ ≈ -1", async () => {
    // ⟨Z⟩ = cos(θ); the minimum is at θ = π.
    const c = circ(1, [gate("ry", [0], [], ["theta"])]);
    const res = await optimizeExpectation(c, [], {
      symbols: ["theta"],
      observable: ["Z"],
      initial: { theta: 2.0 },
      steps: 80,
      learningRate: 0.2,
      epsilon: 1e-4,
      goal: "minimize",
      optimizer: "adam",
    });
    expect(res.finalValue).toBeLessThan(-0.95);
    expect(Math.abs(res.finalParams.theta - Math.PI)).toBeLessThan(0.3);
  });

  test("maximizing ⟨Z⟩ converges to θ ≈ 0, ⟨Z⟩ ≈ +1", async () => {
    const c = circ(1, [gate("ry", [0], [], ["theta"])]);
    const res = await optimizeExpectation(c, [], {
      symbols: ["theta"],
      observable: ["Z"],
      initial: { theta: 0.8 },
      steps: 80,
      learningRate: 0.2,
      epsilon: 1e-4,
      goal: "maximize",
    });
    expect(res.finalValue).toBeGreaterThan(0.95);
  });
});

describe("shot sampler", () => {
  test("counts sum to the requested number of shots", () => {
    const counts = sampleShots([0.25, 0.25, 0.25, 0.25], 1000);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(counts).toHaveLength(4);
  });

  test("a deterministic distribution puts every shot in one bin", () => {
    const counts = sampleShots([0, 1, 0, 0], 500);
    expect(counts[1]).toBe(500);
    expect(counts[0]).toBe(0);
  });

  test("an all-zero distribution yields zero counts", () => {
    expect(sampleShots([0, 0], 100)).toEqual([0, 0]);
  });

  test("unnormalized weights are handled (normalized internally)", () => {
    const counts = sampleShots([2, 2], 1000); // weights, not probabilities
    expect(counts[0] + counts[1]).toBe(1000);
    expect(counts[0]).toBeGreaterThan(400);
    expect(counts[1]).toBeGreaterThan(400);
  });
});

describe("ZNE / landscape / barren-plateau", () => {
  test("zneFit on a noiseless model extrapolates to the ideal value", async () => {
    const r = await zneFit(ryTheta, { theta: Math.PI / 3 }, [], ["Z"], noiseless, [1, 2, 3], "linear");
    expect(r.samples.map((s) => s.scale)).toEqual([1, 2, 3]);
    expect(Math.abs(r.extrapolated - 0.5)).toBeLessThan(1e-6); // cos(π/3) = 0.5
  });

  test("computeLandscape sweeps ⟨Z⟩ = cos θ over a 1-symbol grid", async () => {
    const grid = await computeLandscape(ryTheta, {}, [], ["Z"], ["theta"], 5, [0, 2 * Math.PI]);
    expect(grid.length).toBe(1);
    const expected = [1, 0, -1, 0, 1]; // cos at 0, π/2, π, 3π/2, 2π
    for (let i = 0; i < 5; i++) expect(Math.abs(grid[0][i] - expected[i])).toBeLessThan(1e-6);
  });

  test("computeLandscape supports a 2-symbol grid (correct shape)", async () => {
    const c = circ(2, [gate("ry", [0], [], ["a"]), gate("ry", [1], [], ["b"])]);
    const grid = await computeLandscape(c, {}, [], ["Z", "I"], ["a", "b"], 4, [0, Math.PI]);
    expect(grid.length).toBe(4);
    expect(grid.every((row) => row.length === 4)).toBe(true);
  });

  test("computeLandscape rejects 0 or >2 symbols", async () => {
    await expect(computeLandscape(ryTheta, {}, [], ["Z"], [], 4, [0, 1])).rejects.toThrow();
    await expect(computeLandscape(ryTheta, {}, [], ["Z"], ["a", "b", "c"], 4, [0, 1])).rejects.toThrow();
  });

  test("barrenPlateauDiagnostic reports finite, positive gradient variance for a trainable ansatz", async () => {
    const r = await barrenPlateauDiagnostic(ryTheta, [], ["Z"], ["theta"], 400);
    expect(r.variancePerSymbol.length).toBe(1);
    expect(Number.isFinite(r.variancePerSymbol[0])).toBe(true);
    expect(r.variancePerSymbol[0]).toBeGreaterThan(0.01); // d/dθ cos θ = −sin θ varies
    expect(Number.isFinite(r.meanGradPerSymbol[0])).toBe(true);
  });
});
