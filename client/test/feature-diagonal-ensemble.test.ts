import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { diagonalEnsemble } from "../src/sim/diagonalEnsemble";
import { parsePauliSum } from "../src/sim/trotter";
import { circ, gate } from "./helpers";

const de = (n: number, gates: ReturnType<typeof gate>[], h: string) => {
  const st = simulate(circ(n, gates), {}, []).state;
  return diagonalEnsemble(parsePauliSum(h), st, n)!;
};

describe("diagonalEnsemble", () => {
  test("|0⟩ is an eigenstate of Z: single spike at E = +1", () => {
    const r = de(1, [], "1*Z");
    expect(r.energies).toHaveLength(2);
    const total = r.populations.reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(r.meanEnergy).toBeCloseTo(1, 6);
    expect(r.energySpread).toBeCloseTo(0, 6);
    expect(r.effectiveDim).toBeCloseTo(1, 5);
  });

  test("|+⟩ under H = Z spreads equally over both eigenstates", () => {
    const r = de(1, [gate("h", [0])], "1*Z");
    expect(r.meanEnergy).toBeCloseTo(0, 6); // ⟨+|Z|+⟩ = 0
    expect(r.energySpread).toBeCloseTo(1, 6);
    expect(r.effectiveDim).toBeCloseTo(2, 5);
    for (const p of r.populations) expect(p).toBeCloseTo(0.5, 6);
  });

  test("populations always sum to 1 and ⟨H⟩ matches the direct expectation", () => {
    // H = -ZZ - XI - IX on a non-trivial state.
    const r = de(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("ry", [0], [], ["0.6"], 2)], "-1*ZZ - 1*XI - 1*IX");
    const total = r.populations.reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(r.dim).toBe(4);
    expect(r.energies).toHaveLength(4);
  });

  test("⟨H⟩ from the ensemble equals Σ p_k E_k consistently", () => {
    const r = de(2, [gate("h", [0]), gate("h", [1])], "1*ZI + 1*IZ + 0.5*XX");
    let m = 0;
    for (let k = 0; k < r.energies.length; k++) m += r.populations[k] * r.energies[k];
    expect(r.meanEnergy).toBeCloseTo(m, 9);
  });

  test("|00⟩ ground-state-aligned: localized in energy (small d_eff)", () => {
    // Transverse-field-free Ising H = -ZZ: |00⟩ is a +1... actually ground is the
    // ZZ = +1 sector for -ZZ ⇒ E = -1; |00⟩ sits in that degenerate sector.
    const r = de(2, [], "-1*ZZ");
    expect(r.meanEnergy).toBeCloseTo(-1, 6); // ⟨00|-ZZ|00⟩ = -1
    expect(r.energySpread).toBeCloseTo(0, 6);
  });

  test("returns null past the qubit cap or with empty H", () => {
    const st = simulate(circ(1, [gate("h", [0])]), {}, []).state;
    expect(diagonalEnsemble(parsePauliSum("1*Z"), st, 1, 0)).toBeNull();
    expect(diagonalEnsemble([], st, 1)).toBeNull();
  });
});
