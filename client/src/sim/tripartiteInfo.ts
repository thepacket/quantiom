/**
 * Tripartite (mutual) information I₃(A:B:C) — a diagnostic of scrambling and
 * topological order. For three disjoint qubit regions A, B, C (with an
 * implicit remainder D = rest of the register),
 *
 *   I₃ = I(A:B) + I(A:C) − I(A:BC),
 *
 * where I(X:Y) = S(X) + S(Y) − S(XY) is the quantum mutual information. I₃
 * captures how information about A, once scrambled by the dynamics, becomes
 * delocalised: it goes strongly **negative** for a scrambling channel (the
 * information is in the joint BC, not B or C alone), and is ≥ 0 for
 * non-scrambling / classically-correlated states. It is also a witness of
 * topological order (the constant negative term mirrors the topological
 * entanglement entropy).
 *
 * We take A, B, C as three chosen single qubits, leaving D = the other
 * n − 3 qubits, so every entropy is a reduced density matrix of ≤ 3 qubits
 * (diagonalised on the smaller side). Pure-state path.
 */

import { reducedDensityMatrix } from "./density";
import { vonNeumannEntropy } from "./entanglement";

export type TripartiteResult = {
  /** S(ρ) of A, B, C (each one qubit). */
  sA: number;
  sB: number;
  sC: number;
  /** Pairwise mutual informations, in bits. */
  iAB: number;
  iAC: number;
  iABC: number;
  /** I₃ = I(A:B) + I(A:C) − I(A:BC). Negative ⇒ scrambling. */
  i3: number;
};

/** Entropy of a region; diagonalises whichever side is smaller for speed. */
function regionEntropy(state: Float64Array, n: number, region: number[]): number {
  const inR = new Set(region);
  const comp: number[] = [];
  for (let q = 0; q < n; q++) if (!inR.has(q)) comp.push(q);
  const side = region.length <= comp.length ? region : comp;
  return vonNeumannEntropy(reducedDensityMatrix(state, n, side));
}

export function tripartiteInformation(
  state: Float64Array,
  n: number,
  a: number,
  b: number,
  c: number,
  maxQubits = 14,
): TripartiteResult | null {
  if (n < 4 || n > maxQubits) return null;
  if (a === b || a === c || b === c) return null;
  if ([a, b, c].some((q) => q < 0 || q >= n)) return null;

  const sA = regionEntropy(state, n, [a]);
  const sB = regionEntropy(state, n, [b]);
  const sC = regionEntropy(state, n, [c]);
  const sAB = regionEntropy(state, n, [a, b]);
  const sAC = regionEntropy(state, n, [a, c]);
  const sBC = regionEntropy(state, n, [b, c]);
  const sABC = regionEntropy(state, n, [a, b, c]);

  const iAB = Math.max(0, sA + sB - sAB);
  const iAC = Math.max(0, sA + sC - sAC);
  const iABC = Math.max(0, sA + sBC - sABC);
  const i3 = iAB + iAC - iABC;

  return { sA, sB, sC, iAB, iAC, iABC, i3 };
}
