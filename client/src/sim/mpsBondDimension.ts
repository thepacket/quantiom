/**
 * MPS bond dimension & truncation — how compressible the state is as a matrix
 * product state. Across every contiguous cut the Schmidt spectrum λ_i (squared
 * Schmidt coefficients, Σ = 1) is truncated: keeping the χ largest leaves a
 * truncation error ε(χ) = 1 − Σ_{i<χ} λ_i. For a target error the required
 * bond dimension is the smallest χ with ε(χ) ≤ target; the maximum over cuts
 * is the bond dimension an exact-ish MPS of this state would need. A product
 * state needs χ = 1, a volume-law state needs χ growing exponentially with
 * the cut size. Reuses the entanglement spectrum per cut; statevector path,
 * smaller side ≤ `maxSide`.
 */

import { entanglementSpectrum } from "./entanglement";

export type MpsBondResult = {
  /** Required χ per cut for the target error; NaN where the cut is capped. */
  chi: number[];
  /** Largest required χ across cuts. */
  maxChi: number;
  /** Cut index achieving maxChi. */
  worstCut: number;
  /** Truncation error ε(χ) for the worst cut, χ = 1 … len. */
  truncError: number[];
  numQubits: number;
};

/** Smallest χ such that the tail mass beyond the top χ values is ≤ target. */
function requiredChi(spectrum: number[], target: number): { chi: number; errors: number[] } {
  const sorted = [...spectrum].sort((a, b) => b - a);
  const errors: number[] = [];
  let cum = 0;
  let chi = sorted.length;
  for (let m = 0; m < sorted.length; m++) {
    cum += sorted[m];
    const err = Math.max(0, 1 - cum);
    errors.push(err);
    if (err <= target && chi === sorted.length) chi = m + 1;
  }
  return { chi, errors };
}

export function mpsBondDimension(
  state: Float64Array,
  n: number,
  target = 0.01,
  maxSide = 8,
): MpsBondResult | null {
  if (n < 2) return null;
  const chi = new Array<number>(n - 1).fill(NaN);
  let maxChi = 0;
  let worstCut = 0;
  let worstErrors: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const subsetA = Array.from({ length: k + 1 }, (_, q) => q);
    const spec = entanglementSpectrum(state, n, subsetA, maxSide);
    if (!spec) continue;
    const { chi: c, errors } = requiredChi(spec.spectrum, target);
    chi[k] = c;
    if (c > maxChi) { maxChi = c; worstCut = k; worstErrors = errors; }
  }
  return { chi, maxChi, worstCut, truncError: worstErrors, numQubits: n };
}
