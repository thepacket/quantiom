/**
 * Symmetry-sector decomposition of a measurement distribution.
 *
 * Two abelian symmetries that almost every physical ansatz cares about,
 * read straight off the computational-basis probabilities {p_i}:
 *
 *  • **Excitation number** (Hamming weight): the U(1) charge N̂ = Σ_i (1−Z_i)/2.
 *    Sector k holds the basis states with exactly k ones; its weight is
 *    w_k = Σ_{popcount(i)=k} p_i. A number-conserving circuit (givens
 *    rotations, hopping terms, …) keeps all weight in one k.
 *
 *  • **Z₂ parity**: the global parity Π_i Z_i = (−1)^(Hamming weight). The
 *    even/odd weights are the sums over even/odd k; ⟨Π Z⟩ = P_even − P_odd.
 *
 * Probabilities are defined for mixed states too (they're the diagonal of ρ),
 * so this works unchanged in noise mode. O(2ⁿ).
 */

export type SymmetrySectorsResult = {
  /** weight[k] = total probability in the Hamming-weight-k sector, k = 0…n. */
  weightSectors: number[];
  /** Σ over even Hamming weight. */
  parityEven: number;
  /** Σ over odd Hamming weight. */
  parityOdd: number;
  /** ⟨Π_i Z_i⟩ = parityEven − parityOdd. */
  parityExpectation: number;
  /** Number of sectors carrying non-negligible weight. */
  numOccupiedSectors: number;
  /** True iff all weight sits in a single excitation-number sector. */
  numberConserved: boolean;
  /** True iff all weight sits in one parity sector. */
  parityConserved: boolean;
};

const popcount = (x: number): number => {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
};

export function symmetrySectors(probabilities: number[], n: number, tol = 1e-9): SymmetrySectorsResult {
  const weightSectors = new Array(n + 1).fill(0);
  let parityEven = 0;
  let parityOdd = 0;
  const dim = 1 << n;
  for (let i = 0; i < dim && i < probabilities.length; i++) {
    const p = probabilities[i];
    if (p === 0) continue;
    const w = popcount(i);
    weightSectors[w] += p;
    if (w & 1) parityOdd += p;
    else parityEven += p;
  }

  const numOccupiedSectors = weightSectors.reduce((c, w) => c + (w > tol ? 1 : 0), 0);
  const parityOccupied = (parityEven > tol ? 1 : 0) + (parityOdd > tol ? 1 : 0);

  return {
    weightSectors,
    parityEven,
    parityOdd,
    parityExpectation: parityEven - parityOdd,
    numOccupiedSectors,
    numberConserved: numOccupiedSectors === 1,
    parityConserved: parityOccupied === 1,
  };
}
