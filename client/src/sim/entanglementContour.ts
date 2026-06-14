/**
 * Entanglement contour — a spatial resolution of *where* a region's
 * entanglement entropy comes from. For a contiguous region A = [0..m−1] we
 * use the **incremental** contour
 *
 *   s(j) = S([0..j]) − S([0..j−1]),   S([]) = 0,
 *
 * the marginal entanglement entropy added by extending the region one site at
 * a time. It is exact and telescopes to Σ_{j} s(j) = S(A), so it distributes
 * the region's entanglement across its sites: a flat profile is volume-law,
 * a profile peaked at the region boundary is area-law, and a negative
 * increment flags a site whose inclusion *lowers* the entropy (strong local
 * correlation). Statevector path; each prefix is diagonalised on its own
 * side, so the region is capped at `maxSide` qubits.
 */

import { reducedDensityMatrix } from "./density";
import { densityEigenvalues } from "./entanglement";

export type ContourResult = {
  /** s(j) for j = 0 … regionSize−1. */
  contour: number[];
  /** S(A) for the whole region (= Σ contour). */
  total: number;
  regionSize: number;
};

function prefixEntropy(state: Float64Array, n: number, size: number): number {
  if (size <= 0) return 0;
  const prefix = Array.from({ length: size }, (_, q) => q);
  let s = 0;
  for (const p of densityEigenvalues(reducedDensityMatrix(state, n, prefix))) {
    if (p > 1e-12) s -= p * Math.log2(p);
  }
  return s;
}

export function entanglementContour(
  state: Float64Array,
  n: number,
  regionSize: number,
  maxSide = 7,
): ContourResult | null {
  if (n < 2 || regionSize < 1 || regionSize >= n || regionSize > maxSide) return null;
  const sCum = new Array<number>(regionSize + 1).fill(0);
  for (let size = 1; size <= regionSize; size++) {
    sCum[size] = prefixEntropy(state, n, size);
  }
  const contour = new Array<number>(regionSize);
  for (let j = 0; j < regionSize; j++) contour[j] = sCum[j + 1] - sCum[j];
  return { contour, total: sCum[regionSize], regionSize };
}
