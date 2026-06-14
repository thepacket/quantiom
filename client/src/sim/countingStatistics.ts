/**
 * Full counting statistics of a conserved charge in a subregion.
 *
 * For a chosen subset A of qubits, the "particle number" N_A = Σ_{i∈A} n_i
 * (with n_i = |1⟩⟨1|, i.e. the spin-down / excitation count) has a full
 * probability distribution P(m) = Prob(N_A = m), m = 0 … |A|. Its mean is
 * the average filling and its **variance** is the bipartite charge
 * fluctuation — a cheap, measurable lower proxy for entanglement: for a
 * U(1)-symmetric state the fluctuations of a conserved charge across a cut
 * grow with the entanglement entropy, so a flat product state has zero
 * variance while a scrambled / critical state has large variance.
 *
 * Computed directly from the statevector by binning |amp|² by the Hamming
 * weight of the basis index restricted to A. O(2ⁿ). Statevector path only.
 */

export type CountingResult = {
  /** P(m) for m = 0 … |A| (length |A|+1), summing to 1. */
  p: number[];
  /** ⟨N_A⟩. */
  mean: number;
  /** Var(N_A) — the bipartite charge fluctuation. */
  variance: number;
  /** Number of qubits in A. */
  size: number;
};

export function countingStatistics(
  state: Float64Array,
  n: number,
  region: number[],
  maxQubits = 20,
): CountingResult | null {
  if (n < 1 || n > maxQubits) return null;
  if (region.length === 0 || region.length > n) return null;
  if (region.some((q) => q < 0 || q >= n)) return null;
  const dim = 1 << n;
  const size = region.length;
  // Big-endian: qubit q is bit (n-1-q). Bit value 1 = |1⟩ = one excitation.
  const masks = region.map((q) => 1 << (n - 1 - q));
  const p = new Array<number>(size + 1).fill(0);
  for (let idx = 0; idx < dim; idx++) {
    const pr = state[2 * idx];
    const pi = state[2 * idx + 1];
    const prob = pr * pr + pi * pi;
    if (prob < 1e-18) continue;
    let m = 0;
    for (const mask of masks) if (idx & mask) m++;
    p[m] += prob;
  }
  let mean = 0;
  for (let m = 0; m <= size; m++) mean += m * p[m];
  let variance = 0;
  for (let m = 0; m <= size; m++) variance += (m - mean) * (m - mean) * p[m];
  return { p, mean, variance, size };
}
