import { describe, test, expect } from "vitest";
import { pecExpectation } from "../src/sim/pec";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless = (over: Partial<NoiseModel> = {}): NoiseModel => ({
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0, ...over,
});

// RY(π/3)|0⟩: ⟨Z⟩ = cos(π/3) = 0.5.
const ry = circ(1, [gate("ry", [0], [], ["pi/3"])]);

describe("pecExpectation", () => {
  test("zero noise → value is the ideal ⟨Z⟩, overhead 1, nothing uninverted", () => {
    const r = pecExpectation(ry, {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 200);
    expect(Math.abs(r.value - 0.5)).toBeLessThan(1e-9); // identity inverses ⇒ exact
    expect(r.varianceOverhead).toBeCloseTo(1, 6);
    expect(r.channels.oneQDepol).toBe(1); // one 1q gate location (the RY)
    expect(r.uninverted).toEqual([]);
  });

  test("evaluates symbolic parameters (π/3), not parseFloat-NaN", () => {
    const r = pecExpectation(ry, {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(Number.isNaN(r.value)).toBe(false);
  });

  test("binds free parameters from paramValues", () => {
    const c = circ(1, [gate("ry", [0], [], ["theta"])]);
    const r = pecExpectation(c, { theta: Math.PI }, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(r.value).toBeCloseTo(-1, 9); // ⟨Z⟩ of RY(π)|0⟩ = −1
  });

  test("1q depolarising inflates the overhead and PEC recovers the ideal", () => {
    const noisy = noiseless({ oneQubitDepolarising: 0.05 });
    const r = pecExpectation(ry, {}, [], noisy, { kind: "pauli", paulis: ["Z"] }, 40000);
    expect(r.channels.oneQDepol).toBe(1);
    expect(r.varianceOverhead).toBeGreaterThan(1);
    expect(Math.abs(r.value - 0.5)).toBeLessThan(0.1); // unbiased ⇒ recovers noiseless ⟨Z⟩
  });

  test("an empty circuit is handled gracefully", () => {
    const r = pecExpectation(circ(1, []), {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(Number.isFinite(r.value)).toBe(true);
  });
});
