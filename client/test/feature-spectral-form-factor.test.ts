import { describe, test, expect } from "vitest";
import { spectralFormFactor } from "../src/sim/spectralFormFactor";

describe("spectralFormFactor", () => {
  test("returns null for fewer than 2 levels", () => {
    expect(spectralFormFactor([])).toBeNull();
    expect(spectralFormFactor([1])).toBeNull();
  });

  test("SFF(0⁺) ≈ 1 — all phases aligned at the earliest sampled time", () => {
    const r = spectralFormFactor([0, 1, 2.3, 4.1, 5, 7.2])!;
    expect(r.sff[0]).toBeCloseTo(1, 3);
  });

  test("two non-degenerate levels: plateau = 1/2 and SFF oscillates as (1+cos)/2", () => {
    const r = spectralFormFactor([0, 1])!;
    expect(r.plateau).toBeCloseTo(0.5, 9); // D=2, no degeneracy → 2/4
    // Spot-check the closed form |1 + e^{-it}|²/4 = (1 + cos t)/2 at a sampled t.
    const k = Math.floor(r.t.length / 2);
    const tk = r.t[k];
    expect(r.sff[k]).toBeCloseTo((1 + Math.cos(tk)) / 2, 9);
  });

  test("a fully degenerate spectrum stays at the plateau = 1 (SFF ≡ 1)", () => {
    const r = spectralFormFactor([3, 3, 3, 3])!;
    expect(r.plateau).toBeCloseTo(1, 9); // (4²)/4² = 1
    for (const v of r.sff) expect(v).toBeCloseTo(1, 9);
  });

  test("plateau counts degeneracies: {0,0,1,2} → (4+1+1)/16", () => {
    const r = spectralFormFactor([0, 0, 1, 2])!;
    expect(r.plateau).toBeCloseTo(6 / 16, 9);
  });

  test("times are log-spaced and SFF stays in [0,1]", () => {
    const r = spectralFormFactor([0, 0.7, 1.9, 3.3, 4.0, 6.1, 7.7, 9.0])!;
    expect(r.t[0]).toBeLessThan(r.t[r.t.length - 1]);
    expect(r.heisenbergTime).toBeGreaterThan(0);
    for (const v of r.sff) {
      expect(v).toBeGreaterThanOrEqual(-1e-12);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
