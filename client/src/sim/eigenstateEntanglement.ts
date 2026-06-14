/**
 * Eigenstate entanglement entropy — the half-chain entanglement entropy
 * S(ρ_A) of every *energy eigenstate* of a Pauli-sum Hamiltonian, plotted
 * against its energy. This is the sharpest eigenstate-thermalization vs
 * many-body-localization diagnostic: a thermalizing H has volume-law eigenstate
 * entanglement that traces a smooth arch peaking at mid-spectrum (the Page
 * value), while an integrable / MBL H has low, scattered (area-law) eigenstate
 * entanglement. Complements the prepared-state thermalization panels (diagonal
 * ensemble, effective temperature, ETH off-diagonal), which characterise the
 * *state*, not H's eigenstates. Builds the dense H + a reduced density matrix
 * per eigenvector, so capped at a small n; run on demand.
 */

import type { Complex } from "./density";
import { pauliSparse } from "./pauliMatrix";
import { hermitianEig } from "./eig";
import { reducedDensityMatrix } from "./density";
import { densityEigenvalues } from "./entanglement";
import type { PauliTerm } from "./trotter";

export type EigenstateEntResult = {
  /** Energies E_k, ascending. */
  energies: number[];
  /** Half-chain entanglement entropy of each eigenstate, in bits. */
  entropies: number[];
  /** min(|A|,|B|) — the maximal (Page-ceiling) value, in bits. */
  maxEntropy: number;
  numQubits: number;
};

export function eigenstateEntanglement(
  terms: PauliTerm[],
  n: number,
  maxQubits = 6,
): EigenstateEntResult | null {
  if (n < 2 || n > maxQubits || terms.length === 0) return null;
  const dim = 1 << n;

  // Dense Hermitian H.
  const H: Complex[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => ({ re: 0, im: 0 })),
  );
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    for (let c = 0; c < dim; c++) {
      H[perm[c]][c].re += term.coefficient * phRe[c];
      H[perm[c]][c].im += term.coefficient * phIm[c];
    }
  }
  const { values: energies, vectors } = hermitianEig(H);

  const half = Math.floor(n / 2);
  const subsetA = Array.from({ length: half }, (_, q) => q);
  const maxEntropy = Math.min(half, n - half);

  const entropies = vectors.map((v) => {
    // Eigenvector → interleaved-re/im statevector.
    const psi = new Float64Array(2 * dim);
    for (let i = 0; i < dim; i++) { psi[2 * i] = v[i].re; psi[2 * i + 1] = v[i].im; }
    let s = 0;
    for (const p of densityEigenvalues(reducedDensityMatrix(psi, n, subsetA))) {
      if (p > 1e-12) s -= p * Math.log2(p);
    }
    return s;
  });

  return { energies, entropies, maxEntropy, numQubits: n };
}
