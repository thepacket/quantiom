/**
 * Partial-transpose moments p_n = Tr[(ρ^{T_A})ⁿ] across a cut, and the p₃-PPT
 * entanglement criterion. The moments are the quantities a randomized-
 * measurement / classical-shadow protocol estimates directly (without
 * reconstructing the full state), so they are the practical entanglement
 * probe for *noisy* states. The third-moment condition
 *
 *   p₃ < p₂²  ⟹  the state is entangled (NPT)
 *
 * detects entanglement from low moments alone. Here we evaluate them exactly
 * from the partial-transpose eigenvalues of the pure-state ρ (reusing the
 * negativity-spectrum construction). p₁ = 1, p₂ = Tr(ρ_A²) (purity).
 */

import { negativitySpectrum } from "./negativitySpectrum";

export type PtMomentsResult = {
  /** p_n for n = 1 … maxN. */
  moments: number[];
  p2: number;
  p3: number;
  /** True iff p₃ < p₂² (the criterion flags entanglement). */
  entangledByP3: boolean;
  /** Log-negativity, for cross-reference. */
  logNegativity: number;
};

export function ptMoments(
  state: Float64Array,
  n: number,
  subsetA: number[],
  maxN = 6,
  maxQubits = 6,
): PtMomentsResult | null {
  const ns = negativitySpectrum(state, n, subsetA, maxQubits);
  if (!ns) return null;
  const ev = ns.eigenvalues;
  const moments: number[] = [];
  for (let m = 1; m <= maxN; m++) {
    let s = 0;
    for (const lambda of ev) s += Math.pow(lambda, m);
    moments.push(s);
  }
  const p2 = moments[1] ?? 0;
  const p3 = moments[2] ?? 0;
  return {
    moments,
    p2,
    p3,
    entangledByP3: p3 < p2 * p2 - 1e-9,
    logNegativity: ns.logNegativity,
  };
}
