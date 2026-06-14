import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { allPauliExpectations } from "../src/sim/pauliSpectrum";
import { majoranaStars } from "../src/sim/majoranaStars";
import { magicSpectrum } from "../src/sim/magicSpectrum";
import { multiparameterQFI } from "../src/sim/multiparamQfi";
import { densitySpectrum } from "../src/sim/mixedStateSpectrum";
import { operatorWeightGrowth } from "../src/sim/operatorWeight";
import { workDistribution } from "../src/sim/workDistribution";
import { parsePauliSum } from "../src/sim/trotter";

const close = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps;

function ghz(n: number) {
  const gates = [gate("h", [0])];
  for (let q = 1; q < n; q++) gates.push(gate("cx", [q], [q - 1]));
  return simulate(circ(n, gates), {}).state;
}

describe("majoranaStars", () => {
  test("|000⟩ puts all stars at the north pole, symmetric weight 1", () => {
    const r = majoranaStars(simulate(circ(3, []), {}).state, 3)!;
    expect(r.stars.length).toBe(3);
    for (const s of r.stars) expect(s.theta).toBeLessThan(1e-3);
    expect(close(r.symmetricWeight, 1, 1e-6)).toBe(true);
  });

  test("|111⟩ puts all stars at the south pole", () => {
    const r = majoranaStars(simulate(circ(3, [gate("x", [0]), gate("x", [1]), gate("x", [2])]), {}).state, 3)!;
    for (const s of r.stars) expect(Math.abs(s.theta - Math.PI)).toBeLessThan(1e-3);
  });
});

describe("magicSpectrum", () => {
  test("stabilizer state |+⟩ has M_α = 0 for all α", () => {
    const exp = allPauliExpectations(simulate(circ(1, [gate("h", [0])]), {}).state, 1);
    const r = magicSpectrum(exp, 1);
    for (const m of r.m) expect(close(m, 0, 1e-9)).toBe(true);
    expect(close(r.m2, 0, 1e-9)).toBe(true);
  });

  test("T|+⟩ is a magic state: M₂ > 0 and the whole spectrum is positive", () => {
    const exp = allPauliExpectations(simulate(circ(1, [gate("h", [0]), gate("t", [0])]), {}).state, 1);
    const r = magicSpectrum(exp, 1);
    expect(r.m2).toBeGreaterThan(0.01);
    for (const m of r.m) expect(m).toBeGreaterThan(0);
  });
});

describe("multiparameterQFI", () => {
  test("|00⟩: F = diag(N, N, 0), max eig = N", () => {
    const r = multiparameterQFI(simulate(circ(2, []), {}).state, 2)!;
    expect(close(r.maxEig, 2)).toBe(true); // N = 2
  });

  test("Bell (GHZ-2): max eig reaches N² = 4 (Heisenberg-limited)", () => {
    const r = multiparameterQFI(ghz(2), 2)!;
    expect(close(r.maxEig, 4, 1e-4)).toBe(true);
  });
});

describe("densitySpectrum", () => {
  test("pure |0⟩: spectrum [1,0], purity 1, eff rank 1", () => {
    const rho = new Float64Array(2 * 2 * 2);
    rho[0] = 1; // ρ[0][0] = 1
    const r = densitySpectrum(rho, 2);
    expect(close(r.spectrum[0], 1)).toBe(true);
    expect(close(r.purity, 1)).toBe(true);
    expect(close(r.effectiveRank, 1)).toBe(true);
    expect(close(r.entropy, 0)).toBe(true);
  });

  test("maximally mixed I/2: purity ½, eff rank 2, S = 1 bit", () => {
    const rho = new Float64Array(2 * 2 * 2);
    rho[2 * 0] = 0.5;       // ρ[0][0]
    rho[2 * (1 * 2 + 1)] = 0.5; // ρ[1][1]
    const r = densitySpectrum(rho, 2);
    expect(close(r.purity, 0.5)).toBe(true);
    expect(close(r.effectiveRank, 2)).toBe(true);
    expect(close(r.entropy, 1)).toBe(true);
  });
});

describe("operatorWeightGrowth", () => {
  test("empty circuit keeps the operator at weight 1; rows sum to 1", () => {
    const r = operatorWeightGrowth(circ(2, []), {}, [], 0, "Z", 8, 4)!;
    for (const row of r.weights) {
      expect(close(row[1], 1, 1e-6)).toBe(true);
      expect(close(row.reduce((a, b) => a + b, 0), 1, 1e-6)).toBe(true);
    }
  });
});

describe("workDistribution", () => {
  test("H=Z, identity circuit: zero work with certainty", () => {
    const terms = parsePauliSum("1*Z");
    const r = workDistribution(terms, circ(1, []), {}, [], 16, 5)!;
    expect(close(r.meanWork, 0, 1e-6)).toBe(true);
    expect(close(r.variance, 0, 1e-6)).toBe(true);
  });

  test("H=Z, X quench: deterministic work of −2", () => {
    const terms = parsePauliSum("1*Z");
    const r = workDistribution(terms, circ(1, [gate("x", [0])]), {}, [], 16, 5)!;
    expect(close(r.meanWork, -2, 1e-5)).toBe(true);
    expect(close(r.variance, 0, 1e-5)).toBe(true);
  });
});
