/**
 * Readout-error mitigation by confusion-matrix inversion.
 *
 * Real measurement is noisy: a prepared |0⟩ is sometimes read as 1 and vice
 * versa. For independent, symmetric per-qubit bit-flip with probability `p`,
 * the measured distribution is `A · p_true` where `A = ⊗_q A_q` and
 *
 *     A_q = [[1−p,  p ],
 *            [ p , 1−p]]   (column = true bit, row = measured bit).
 *
 * Because `A` is a tensor product, we never form the full 2ⁿ×2ⁿ matrix: we
 * apply each qubit's 2×2 inverse to the distribution in place, O(n · 2ⁿ).
 * The single-qubit inverse is
 *
 *     A_q⁻¹ = 1/(1−2p) · [[1−p, −p ],
 *                          [−p , 1−p]].
 *
 * Inversion can push probabilities slightly negative; we clip to ≥ 0 and
 * renormalise (the standard, positivity-preserving cleanup). Pure functions,
 * no DOM/sim dependencies — `applyReadoutError` is the forward model (used to
 * demonstrate recovery and in tests).
 *
 * Big-endian convention: qubit q is bit (n − 1 − q) of the distribution index.
 */

/** Apply a 2×2 stochastic/linear map to qubit `q` of a length-2ⁿ vector. */
function apply1q(dist: number[], n: number, q: number, m00: number, m01: number, m10: number, m11: number): number[] {
  const out = dist.slice();
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  for (let i = 0; i < dim; i++) {
    if (i & mask) continue; // process each (i0, i1) pair once from the 0 side
    const j = i | mask;
    const a = dist[i]; // bit = 0
    const b = dist[j]; // bit = 1
    out[i] = m00 * a + m01 * b;
    out[j] = m10 * a + m11 * b;
  }
  return out;
}

/** Forward readout-error model: turn a true distribution into the measured
 *  one under independent symmetric bit-flip `p` on every qubit. */
export function applyReadoutError(trueDist: number[], n: number, p: number): number[] {
  let d = trueDist;
  for (let q = 0; q < n; q++) d = apply1q(d, n, q, 1 - p, p, p, 1 - p);
  return d;
}

export type MitigationResult = {
  /** The corrected (mitigated) distribution, clipped ≥ 0 and renormalised. */
  corrected: number[];
  /** Total negative mass clipped away before renormalising (a quality flag:
   *  large values mean the inversion is ill-conditioned at this `p`). */
  clippedMass: number;
};

/** Invert the readout-error model: recover an estimate of the true
 *  distribution from a measured one. Returns the measured distribution
 *  unchanged when `p` is 0 (or ≥ ½, where the channel is non-invertible). */
export function mitigateReadout(measuredDist: number[], n: number, p: number): MitigationResult {
  if (p <= 0 || p >= 0.5) return { corrected: measuredDist.slice(), clippedMass: 0 };
  const inv = 1 / (1 - 2 * p);
  let d = measuredDist;
  for (let q = 0; q < n; q++) {
    d = apply1q(d, n, q, inv * (1 - p), inv * -p, inv * -p, inv * (1 - p));
  }
  // Clip negatives and renormalise.
  let clippedMass = 0;
  let total = 0;
  const corrected = d.map((v) => {
    if (v < 0) {
      clippedMass += -v;
      return 0;
    }
    total += v;
    return v;
  });
  if (total > 0) for (let i = 0; i < corrected.length; i++) corrected[i] /= total;
  return { corrected, clippedMass };
}
