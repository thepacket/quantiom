/**
 * Three-tangle (Coffman–Kundu–Wootters residual tangle) for a 3-qubit pure
 * state. The one-tangle of the focal qubit a against the other two,
 * τ_{a(bc)} = 4·det(ρ_a) = 2(1 − Tr ρ_a²), is bounded below by the sum of its
 * pairwise squared concurrences (CKW monogamy):
 *
 *   τ₃ = τ_{a(bc)} − C²_{ab} − C²_{ac} ≥ 0.
 *
 * τ₃ is the genuine tripartite entanglement: it is 1 for the GHZ state and 0
 * for the W state (whose entanglement is purely pairwise), so it cleanly
 * separates the two SU(2)³ entanglement classes. Defined for a pure 3-qubit
 * state; reuses the Wootters concurrence on each reduced pair.
 */

import { reducedDensityMatrix, purity } from "./density";
import { concurrence } from "./concurrence";

export type ThreeTangleResult = {
  /** Focal qubit. */
  focal: number;
  /** One-tangle τ_{a(bc)} = 2(1 − Tr ρ_a²). */
  oneTangle: number;
  /** Squared pairwise concurrences from the focal qubit. */
  cab2: number;
  cac2: number;
  /** Residual three-tangle τ₃ ≥ 0. */
  tau3: number;
};

export function threeTangle(
  state: Float64Array,
  n: number,
  a: number,
  b: number,
  c: number,
): ThreeTangleResult | null {
  if (n !== 3) return null;
  if (a === b || a === c || b === c) return null;
  if ([a, b, c].some((q) => q < 0 || q >= 3)) return null;

  const oneTangle = 2 * (1 - purity(reducedDensityMatrix(state, n, [a])));
  const cab = concurrence(reducedDensityMatrix(state, n, [a, b]));
  const cac = concurrence(reducedDensityMatrix(state, n, [a, c]));
  const cab2 = cab * cab;
  const cac2 = cac * cac;
  const tau3 = Math.max(0, oneTangle - cab2 - cac2);
  return { focal: a, oneTangle, cab2, cac2, tau3 };
}
