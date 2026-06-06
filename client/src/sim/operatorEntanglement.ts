/**
 * Operator entanglement (entangling power) of the circuit unitary U.
 *
 * View U as a state |U⟩ in the doubled Hilbert space H_out ⊗ H_in and take
 * its Schmidt decomposition across a qubit bipartition A|B: reshape U's
 * indices into a matrix M whose rows are (A_out, A_in) and columns
 * (B_out, B_in). The squared singular values of M (normalised by 2ⁿ) are the
 * **operator-Schmidt coefficients** λ_i (Σλ = 1), and the **operator
 * entanglement entropy** E_op = −Σ λ_i log₂ λ_i measures how non-local the
 * whole gate sequence is — independent of any input state.
 *
 *   • E_op = 0  ⇔ U = U_A ⊗ U_B (a product, non-entangling circuit),
 *   • a single CNOT across the cut gives E_op = 1,
 *   • a SWAP across the cut is maximal for one qubit each side.
 *
 * Singular values come from the eigenvalues of M M† (Hermitian PSD). Builds U
 * column-by-column via `simulate(startIndex)`; capped at small n.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { Complex } from "./density";
import { densityEigenvalues } from "./entanglement";

export type OperatorEntanglementResult = {
  /** Operator-Schmidt coefficients λ_i, sorted descending, Σ = 1. */
  spectrum: number[];
  /** Operator entanglement entropy −Σ λ log₂ λ, in ebits. */
  entropy: number;
  /** Number of qubits in block A (the cut is A = [0..cutA), B = rest). */
  cutA: number;
  numQubits: number;
};

export const MAX_OPENT_QUBITS = 6;

export function operatorEntanglement(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  maxQubits = MAX_OPENT_QUBITS,
): OperatorEntanglementResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  const dim = 1 << n;

  // U[i][j] complex, column by column (input basis state j → output column).
  const Ure: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Uim: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  for (let j = 0; j < dim; j++) {
    const psi = simulate(circuit, paramValues, customGates, { startIndex: j }).state;
    for (let i = 0; i < dim; i++) { Ure[i][j] = psi[2 * i]; Uim[i][j] = psi[2 * i + 1]; }
  }

  const aQ = Math.floor(n / 2);   // |A|
  const bQ = n - aQ;              // |B|
  const dA = 1 << aQ, dB = 1 << bQ;
  const rows = dA * dA;          // (A_out, A_in)
  // M[row][col] = U[i][j], i = iA·dB + iB, j = jA·dB + jB,
  //   row = iA·dA + jA, col = iB·dB + jB.
  // G = M M†  (rows × rows, Hermitian PSD); eigenvalues = singular values².
  const G: Complex[][] = Array.from({ length: rows }, () => Array.from({ length: rows }, () => ({ re: 0, im: 0 })));
  for (let iA = 0; iA < dA; iA++)
    for (let jA = 0; jA < dA; jA++) {
      const r = iA * dA + jA;
      for (let kA = 0; kA < dA; kA++)
        for (let lA = 0; lA < dA; lA++) {
          const rp = kA * dA + lA;
          if (rp < r) continue; // Hermitian: fill upper, mirror
          let re = 0, im = 0;
          for (let iB = 0; iB < dB; iB++)
            for (let jB = 0; jB < dB; jB++) {
              const i1 = iA * dB + iB, j1 = jA * dB + jB;
              const i2 = kA * dB + iB, j2 = lA * dB + jB;
              const ar = Ure[i1][j1], ai = Uim[i1][j1];
              const br = Ure[i2][j2], bi = Uim[i2][j2]; // conj below
              // M[r][col]·conj(M[rp][col]) = (ar+iai)(br−ibi)
              re += ar * br + ai * bi;
              im += ai * br - ar * bi;
            }
          G[r][rp] = { re, im };
          G[rp][r] = { re, im: -im };
        }
    }

  const eig = densityEigenvalues(G); // = singular values²; descending, clamped ≥ 0
  // Normalise by ‖U‖_F² = 2ⁿ so Σ λ = 1.
  const norm = dim;
  const spectrum = eig.map((x) => x / norm).filter((x) => x > 1e-12).sort((a, b) => b - a);
  let entropy = 0;
  for (const l of spectrum) if (l > 1e-12) entropy -= l * Math.log2(l);

  return { spectrum, entropy, cutA: aQ, numQubits: n };
}
