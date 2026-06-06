import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { parsePauliSum } from "../src/sim/trotter";
import { circ, gate } from "./helpers";
import { structureFactor } from "../src/sim/structureFactor";
import { krylovComplexity } from "../src/sim/krylov";
import { operatorEntanglement } from "../src/sim/operatorEntanglement";
import { entanglementAsymmetrySweep, asymmetryOf } from "../src/sim/entanglementAsymmetry";
import type { Complex } from "../src/sim/density";

const stateOf = (n: number, g: ReturnType<typeof gate>[]) => simulate(circ(n, g), {}, []).state;

describe("structureFactor", () => {
  test("antiferromagnetic cat (|0101⟩+|1010⟩)/√2 peaks at k = π", () => {
    // The *connected* correlator vanishes for a product state, so genuine
    // (fluctuating) Néel order needs a superposition.
    const n = 4;
    const st = new Float64Array(2 * (1 << n));
    const amp = Math.SQRT1_2;
    st[2 * 0b0101] = amp;
    st[2 * 0b1010] = amp;
    const r = structureFactor(st, n)!;
    expect(r.peakK).toBeCloseTo(Math.PI, 1);
  });

  test("ferromagnetic |0000⟩ has its peak at k = 0", () => {
    const r = structureFactor(stateOf(4, []), 4)!;
    // all C(j,l) = 0 for |0000⟩ (no fluctuations) → S(k) ≡ 0; peak picks k=0.
    expect(r.peakK).toBeCloseTo(0, 6);
  });

  test("GHZ has uniform ferromagnetic correlations → peak at k = 0", () => {
    const r = structureFactor(stateOf(4, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2), gate("cx", [3], [2], [], 3)]), 4)!;
    expect(r.peakK).toBeCloseTo(0, 6);
    expect(r.peakS).toBeGreaterThan(1); // strong ferro peak
  });

  test("returns null below 2 qubits", () => {
    expect(structureFactor(stateOf(1, [gate("h", [0])]), 1)).toBeNull();
  });
});

describe("krylovComplexity", () => {
  test("b coefficients exist and C(t) starts at 0 and grows", () => {
    const st = stateOf(3, [gate("h", [0]), gate("h", [1]), gate("h", [2])]);
    const r = krylovComplexity(parsePauliSum("-1*ZZI - 1*IZZ + 0.9*XII + 0.9*IXI + 0.9*IIX"), st, 3)!;
    expect(r.krylovDim).toBeGreaterThan(1);
    expect(r.b.length).toBe(r.krylovDim - 1);
    expect(r.complexity[0]).toBeCloseTo(0, 6); // C(0) = 0 (all weight on K0)
    expect(r.maxComplexity).toBeGreaterThan(0);
  });

  test("eigenstate of H stays put: Krylov dim 1, no spread", () => {
    // |0⟩ is an eigenstate of H = Z ⇒ Krylov space is 1-dimensional.
    const r = krylovComplexity(parsePauliSum("1*Z"), stateOf(1, []), 1)!;
    expect(r.krylovDim).toBe(1);
    expect(r.maxComplexity).toBeCloseTo(0, 9);
  });
});

describe("operatorEntanglement", () => {
  test("identity-like product circuit has zero operator entanglement", () => {
    // Single-qubit gates on each wire ⇒ U = U_A ⊗ U_B ⇒ E_op = 0.
    const r = operatorEntanglement(circ(2, [gate("h", [0]), gate("x", [1])]), {}, [])!;
    expect(r.entropy).toBeCloseTo(0, 6);
    expect(r.spectrum[0]).toBeCloseTo(1, 6);
  });

  test("a CNOT across the cut gives operator entanglement 1 ebit", () => {
    const r = operatorEntanglement(circ(2, [gate("cx", [1], [0])]), {}, [])!;
    expect(r.entropy).toBeCloseTo(1, 5);
  });

  test("SWAP across a 1|1 cut is maximal (2 ebits)", () => {
    const r = operatorEntanglement(circ(2, [gate("swap", [0, 1])]), {}, [])!;
    expect(r.entropy).toBeCloseTo(2, 5);
  });

  test("returns null below 2 qubits", () => {
    expect(operatorEntanglement(circ(1, [gate("h", [0])]), {}, [])).toBeNull();
  });
});

describe("entanglementAsymmetry", () => {
  test("a number-conserving subsystem state has zero asymmetry", () => {
    // ρ_A diagonal in Hamming weight (a basis state) ⇒ projection is identity.
    const rhoA: Complex[][] = [
      [{ re: 1, im: 0 }, { re: 0, im: 0 }],
      [{ re: 0, im: 0 }, { re: 0, im: 0 }],
    ];
    expect(asymmetryOf(rhoA)).toBeCloseTo(0, 9);
  });

  test("a coherent superposition across charges has positive asymmetry", () => {
    // ρ_A = |+⟩⟨+| has a 0–1 coherence (different Hamming weights) ⇒ ΔS > 0.
    const rhoA: Complex[][] = [
      [{ re: 0.5, im: 0 }, { re: 0.5, im: 0 }],
      [{ re: 0.5, im: 0 }, { re: 0.5, im: 0 }],
    ];
    const dS = asymmetryOf(rhoA);
    expect(dS).toBeGreaterThan(0.5); // S(diag)=1 bit, S(full)=0 ⇒ ΔS=1
    expect(dS).toBeCloseTo(1, 6);
  });

  test("sweep returns one value per column and is non-negative", () => {
    const r = entanglementAsymmetrySweep(
      circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]), {}, [],
    )!;
    expect(r.numCols).toBe(2);
    for (const v of r.asymmetry) expect(v).toBeGreaterThanOrEqual(0);
  });
});
