/**
 * Exact eigenvalue spectrum of a Pauli-sum Hamiltonian H = Σ_k h_k P_k.
 * Builds the dense 2ⁿ × 2ⁿ Hermitian matrix from the parsed terms and
 * diagonalises it (via the real-symmetric embedding used elsewhere for
 * density matrices). Returns the sorted energy levels, the ground energy,
 * and the spectral gap — the reference a VQE run is trying to reach, with
 * the gap that sets how hard the optimisation is.
 *
 * Diagonalisation is O((2ⁿ)³)-ish, so capped at a small qubit count and
 * run only on demand.
 */

import type { Complex } from "./density";
import { densityEigenvaluesSigned } from "./entanglement";
import { pauliSparse } from "./pauliMatrix";
import type { PauliTerm } from "./trotter";

export type HamSpectrumResult = {
  /** Eigenvalues sorted ascending. */
  energies: number[];
  ground: number;
  /** E₁ − E₀ (gap above the ground state; 0 if degenerate). */
  gap: number;
  numQubits: number;
};

export function hamiltonianSpectrum(
  terms: PauliTerm[],
  n: number,
  maxQubits = 6,
): HamSpectrumResult | null {
  if (n < 1 || n > maxQubits || terms.length === 0) return null;
  const dim = 1 << n;
  // Dense Hermitian H = Σ h_k P_k.
  const H: Complex[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => ({ re: 0, im: 0 })),
  );
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      // (h P)[perm[c]][c] += h · ph[c]
      H[perm[c]][c].re += h * phRe[c];
      H[perm[c]][c].im += h * phIm[c];
    }
  }
  const energies = densityEigenvaluesSigned(H).sort((a, b) => a - b);
  const ground = energies[0];
  const gap = energies.length > 1 ? energies[1] - energies[0] : 0;
  return { energies, ground, gap, numQubits: n };
}
