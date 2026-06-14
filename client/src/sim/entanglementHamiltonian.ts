/**
 * Entanglement (Li–Haldane) spectrum across a bipartition A | (rest).
 *
 * Writing the reduced density matrix as a thermal state ρ_A = e^{−H_E} / Z,
 * the "entanglement energies" are ξ_i = −ln λ_i, where λ_i are the
 * eigenvalues of ρ_A (the squared Schmidt coefficients). The low-lying
 * structure of this entanglement Hamiltonian H_E — its level counting and
 * gaps — is a fingerprint of topological order (Li & Haldane 2008): for a
 * topological phase the entanglement spectrum mirrors the edge-state
 * spectrum, with a characteristic counting that is robust to perturbations.
 *
 * Reuses the entanglement spectrum (eigenvalues of ρ_A from the smaller
 * side of the cut), then maps each surviving eigenvalue to ξ_i = −ln λ_i,
 * sorted ascending (lowest entanglement energy = largest Schmidt weight).
 * Statevector path only.
 */

import { entanglementSpectrum } from "./entanglement";

export type EntHamResult = {
  /** Entanglement energies ξ_i = −ln λ_i, sorted ascending. */
  levels: number[];
  /** Bipartite von Neumann entropy S(ρ_A) in bits (= Σ λ ξ / ln2 form). */
  entropy: number;
  /** Schmidt rank (number of non-negligible levels). */
  rank: number;
};

export function entanglementHamiltonian(
  state: Float64Array,
  n: number,
  subsetA: number[],
  maxSide = 6,
  cutoff = 1e-12,
): EntHamResult | null {
  const spec = entanglementSpectrum(state, n, subsetA, maxSide);
  if (!spec) return null;
  const levels: number[] = [];
  for (const lambda of spec.spectrum) {
    if (lambda > cutoff) levels.push(-Math.log(lambda));
  }
  levels.sort((a, b) => a - b);
  return { levels, entropy: spec.entropy, rank: spec.rank };
}
