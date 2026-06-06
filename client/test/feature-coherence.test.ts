import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { coherenceFromAmplitudes, coherenceFromDensity } from "../src/sim/coherence";
import type { Complex } from "../src/sim/density";
import { circ, gate } from "./helpers";

const cohOf = (n: number, gates: ReturnType<typeof gate>[]) => {
  const res = simulate(circ(n, gates), {}, []);
  return coherenceFromAmplitudes(res.state, n);
};

describe("coherenceFromAmplitudes (pure states)", () => {
  test("basis state |0…0⟩ has zero coherence", () => {
    const r = cohOf(3, []);
    expect(r.cL1).toBeCloseTo(0, 9);
    expect(r.cRel).toBeCloseTo(0, 9);
    expect(r.stateEntropy).toBe(0);
    expect(r.cL1Max).toBe(7); // 2³ − 1
    expect(r.cRelMax).toBe(3);
  });

  test("|+⟩ on one qubit: maximally coherent (C_l1 = 1, C_rel = 1 bit)", () => {
    const r = cohOf(1, [gate("h", [0])]);
    expect(r.cL1).toBeCloseTo(1, 9); // d − 1 = 1
    expect(r.cRel).toBeCloseTo(1, 9);
    expect(r.cL1Max).toBe(1);
  });

  test("|+⟩^⊗n saturates both maxima (maximally coherent state)", () => {
    for (const n of [2, 3, 4]) {
      const gs = Array.from({ length: n }, (_, q) => gate("h", [q]));
      const r = cohOf(n, gs);
      expect(r.cL1).toBeCloseTo((1 << n) - 1, 6); // d − 1
      expect(r.cRel).toBeCloseTo(n, 6); // log2 d
    }
  });

  test("GHZ: C_l1 = 1 (one off-diagonal pair), C_rel = 1 bit", () => {
    const r = cohOf(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]);
    // ψ = (|000⟩+|111⟩)/√2 ⇒ Σ|ψ_i| = 2·(1/√2)=√2 ⇒ C_l1 = 2 − 1 = 1.
    expect(r.cL1).toBeCloseTo(1, 9);
    expect(r.cRel).toBeCloseTo(1, 9);
  });

  test("Z gate adds a phase but does not change basis-coherence", () => {
    const a = cohOf(1, [gate("h", [0], [], [], 0)]);
    const b = cohOf(1, [gate("h", [0], [], [], 0), gate("z", [0], [], [], 1)]);
    expect(b.cL1).toBeCloseTo(a.cL1, 9);
    expect(b.cRel).toBeCloseTo(a.cRel, 9);
  });
});

describe("coherenceFromDensity (mixed states)", () => {
  const I2 = (re: number, im = 0): Complex => ({ re, im });

  test("maximally mixed I/2 has zero coherence (diagonal)", () => {
    const rho: Complex[][] = [
      [I2(0.5), I2(0)],
      [I2(0), I2(0.5)],
    ];
    const r = coherenceFromDensity(rho, 1);
    expect(r.cL1).toBeCloseTo(0, 9);
    expect(r.stateEntropy).toBeCloseTo(1, 6); // S(I/2) = 1 bit
    // S(ρ_diag) = 1 bit too ⇒ C_rel = 0.
    expect(r.cRel).toBeCloseTo(0, 6);
  });

  test("pure |+⟩ as a density matrix matches the amplitude form", () => {
    const rho: Complex[][] = [
      [I2(0.5), I2(0.5)],
      [I2(0.5), I2(0.5)],
    ];
    const r = coherenceFromDensity(rho, 1);
    expect(r.cL1).toBeCloseTo(1, 9); // |ρ01| + |ρ10| = 1
    expect(r.cRel).toBeCloseTo(1, 6);
    expect(r.stateEntropy).toBeCloseTo(0, 6);
  });

  test("dephased |+⟩ loses l₁ coherence as the off-diagonal shrinks", () => {
    // ρ = [[.5, γ/2],[γ/2, .5]] with damping γ ∈ {1, .5, 0}.
    const cL1Of = (g: number) => {
      const rho: Complex[][] = [
        [I2(0.5), I2(g / 2)],
        [I2(g / 2), I2(0.5)],
      ];
      return coherenceFromDensity(rho, 1).cL1;
    };
    expect(cL1Of(1)).toBeCloseTo(1, 9);
    expect(cL1Of(0.5)).toBeCloseTo(0.5, 9);
    expect(cL1Of(0)).toBeCloseTo(0, 9);
  });
});
