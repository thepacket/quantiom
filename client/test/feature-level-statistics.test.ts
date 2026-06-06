import { describe, test, expect } from "vitest";
import { levelStatistics, POISSON_R, GOE_R } from "../src/sim/levelStatistics";

describe("levelStatistics", () => {
  test("needs at least 3 levels", () => {
    expect(levelStatistics([])).toBeNull();
    expect(levelStatistics([1, 2])).toBeNull();
    expect(levelStatistics([1, 2, 3])).not.toBeNull();
  });

  test("equally spaced spectrum (picket fence) ⇒ all gap ratios = 1", () => {
    const E = Array.from({ length: 50 }, (_, i) => i * 0.7);
    const s = levelStatistics(E)!;
    expect(s.spacings).toHaveLength(49);
    expect(s.ratios).toHaveLength(48);
    for (const r of s.ratios) expect(r).toBeCloseTo(1, 12);
    expect(s.meanRatio).toBeCloseTo(1, 12);
    expect(s.degenerateFraction).toBe(0);
  });

  test("ratio is symmetric: min/max regardless of order", () => {
    // spacings 1, 3, 1 ⇒ ratios min/max = 1/3, 1/3
    const s = levelStatistics([0, 1, 4, 5])!;
    expect(s.spacings).toEqual([1, 3, 1]);
    expect(s.ratios[0]).toBeCloseTo(1 / 3, 12);
    expect(s.ratios[1]).toBeCloseTo(1 / 3, 12);
  });

  test("unsorted input is sorted internally", () => {
    const a = levelStatistics([5, 0, 1, 4])!;
    const b = levelStatistics([0, 1, 4, 5])!;
    expect(a.spacings).toEqual(b.spacings);
    expect(a.meanRatio).toBeCloseTo(b.meanRatio, 12);
  });

  test("degeneracies produce zero spacings ⇒ r = 0 and are reported", () => {
    const s = levelStatistics([0, 0, 1, 2, 3])!;
    expect(s.degenerateFraction).toBeGreaterThan(0);
    // First spacing is zero ⇒ first ratio (with second spacing) drops to 0.
    expect(s.ratios[0]).toBe(0);
  });

  test("histogram normalises to a density (∫ over [0,1] = 1)", () => {
    const E = Array.from({ length: 200 }, () => Math.random() * 10);
    const s = levelStatistics(E, 20)!;
    expect(s.hist).toHaveLength(20);
    const integral = s.hist.reduce((acc, v) => acc + v / s.bins, 0);
    expect(integral).toBeCloseTo(1, 6);
  });

  test("Poisson spectrum (i.i.d. levels) ⟨r⟩ sits near the Poisson value", () => {
    // Average several large random spectra to de-flake.
    let acc = 0;
    const trials = 8;
    for (let k = 0; k < trials; k++) {
      const E = Array.from({ length: 1500 }, () => Math.random());
      acc += levelStatistics(E)!.meanRatio;
    }
    const mean = acc / trials;
    expect(mean).toBeGreaterThan(POISSON_R - 0.04);
    expect(mean).toBeLessThan(POISSON_R + 0.04);
    // …and clearly distinguishable from the GOE value.
    expect(Math.abs(mean - POISSON_R)).toBeLessThan(Math.abs(mean - GOE_R));
  });

  test("reference constants", () => {
    expect(POISSON_R).toBeCloseTo(0.38629, 4);
    expect(GOE_R).toBeCloseTo(0.5307, 4);
  });
});
