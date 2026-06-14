/**
 * Schmidt gap across every contiguous bipartition — Δλ(k) = λ₁ − λ₂, the
 * difference between the two largest eigenvalues of ρ_{[0..k]} (the two
 * largest squared Schmidt coefficients across the cut after qubit k). The
 * Schmidt gap is an order parameter for symmetry-protected topological phase
 * transitions: it stays open in a gapped phase and **closes** (Δλ → 0) at a
 * critical point, where the entanglement spectrum becomes degenerate. Reuses
 * the entanglement spectrum per cut (diagonalising the smaller side);
 * statevector path, smaller side ≤ `maxSide`.
 */

import { entanglementSpectrum } from "./entanglement";

export type SchmidtGapResult = {
  /** Δλ(k) = λ₁ − λ₂ for the cut after qubit k; length n−1, NaN where the
   *  cut's smaller side exceeds the cap. */
  gap: number[];
  numQubits: number;
};

export function schmidtGap(
  state: Float64Array,
  n: number,
  maxSide = 8,
): SchmidtGapResult | null {
  if (n < 2) return null;
  const gap = new Array<number>(n - 1).fill(NaN);
  for (let k = 0; k < n - 1; k++) {
    const subsetA = Array.from({ length: k + 1 }, (_, q) => q);
    const spec = entanglementSpectrum(state, n, subsetA, maxSide);
    if (!spec) continue;
    const l1 = spec.spectrum[0] ?? 0;
    const l2 = spec.spectrum[1] ?? 0;
    gap[k] = Math.max(0, l1 - l2);
  }
  return { gap, numQubits: n };
}
