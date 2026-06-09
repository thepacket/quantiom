import { describe, it, expect } from "vitest";
import { applyReadoutError, mitigateReadout } from "../src/sim/readoutMitigation";

describe("readout mitigation", () => {
  it("forward model flips a single qubit with probability p", () => {
    const d = applyReadoutError([1, 0], 1, 0.1); // true |0⟩
    expect(d[0]).toBeCloseTo(0.9, 10);
    expect(d[1]).toBeCloseTo(0.1, 10);
  });

  it("mitigation inverts the forward model (1 qubit)", () => {
    const truth = [0.7, 0.3];
    const measured = applyReadoutError(truth, 1, 0.08);
    const { corrected } = mitigateReadout(measured, 1, 0.08);
    expect(corrected[0]).toBeCloseTo(0.7, 8);
    expect(corrected[1]).toBeCloseTo(0.3, 8);
  });

  it("mitigation inverts the forward model (2 qubits, tensor)", () => {
    const truth = [0.5, 0.0, 0.0, 0.5]; // Bell-like Z distribution
    const p = 0.05;
    const measured = applyReadoutError(truth, 2, p);
    // measured should have leaked mass onto |01⟩, |10⟩
    expect(measured[1]).toBeGreaterThan(0);
    const { corrected } = mitigateReadout(measured, 2, p);
    expect(corrected[0]).toBeCloseTo(0.5, 7);
    expect(corrected[3]).toBeCloseTo(0.5, 7);
    expect(corrected[1]).toBeCloseTo(0, 7);
  });

  it("p = 0 and p ≥ ½ are no-ops", () => {
    const d = [0.6, 0.4];
    expect(mitigateReadout(d, 1, 0).corrected).toEqual(d);
    expect(mitigateReadout(d, 1, 0.5).corrected).toEqual(d);
  });

  it("clips negative mass and renormalises to a valid distribution", () => {
    const measured = applyReadoutError([1, 0], 1, 0.2);
    const { corrected, clippedMass } = mitigateReadout(measured, 1, 0.2);
    const sum = corrected.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(corrected.every((v) => v >= 0)).toBe(true);
    expect(clippedMass).toBeGreaterThanOrEqual(0);
  });
});
