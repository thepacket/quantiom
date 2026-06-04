import { describe, test, expect } from "vitest";
import { optimizeExpectation } from "../src/sim/optimize";
import { sampleShots } from "../src/sim/sample";
import { circ, gate } from "./helpers";

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
