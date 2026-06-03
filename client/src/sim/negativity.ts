/**
 * Pairwise entanglement negativity. For each qubit pair (i, j) we take the
 * two-qubit reduced density matrix ρ_ij, partial-transpose one qubit, and
 * read the logarithmic negativity
 *
 *   E_N(i,j) = log₂ ‖ρ_ij^{T_B}‖₁ = log₂ Σ_k |λ_k|
 *
 * from the (signed) eigenvalues λ_k of the partial transpose.
 *
 * Why this complements the mutual-information map: for a 2-qubit system the
 * PPT (positive partial transpose) criterion is *necessary and sufficient*,
 * so E_N(i,j) > 0 **iff** the pair is genuinely entangled. Mutual
 * information lumps classical and quantum correlation together and can't
 * make that call — a classically-correlated pair has I > 0 but E_N = 0.
 * For a Bell pair E_N = 1; product / merely-classical pairs read 0.
 */

import { reducedDensityMatrix, type Complex } from "./density";
import { densityEigenvaluesSigned } from "./entanglement";

export type NegativityResult = {
  /** Symmetric n×n matrix of pairwise log-negativity E_N(i,j) in "ebits";
   *  diagonal is 0. */
  neg: number[][];
  /** Largest pairwise E_N, for colour-scale normalisation. */
  maxNeg: number;
  numQubits: number;
};

/** Partial transpose of a 4×4 two-qubit ρ on the second qubit (B). */
function partialTransposeB(rho: Complex[][]): Complex[][] {
  const out: Complex[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ({ re: 0, im: 0 })),
  );
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let ap = 0; ap < 2; ap++)
        for (let bp = 0; bp < 2; bp++) {
          // ρ^{T_B}[(a,b),(a',b')] = ρ[(a,b'),(a',b)]
          out[a * 2 + b][ap * 2 + bp] = rho[a * 2 + bp][ap * 2 + b];
        }
  return out;
}

export function negativityMatrix(
  state: Float64Array,
  n: number,
  maxQubits = 12,
): NegativityResult | null {
  if (n < 2 || n > maxQubits) return null;
  const neg: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let maxNeg = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rho = reducedDensityMatrix(state, n, [i, j]);
      const ev = densityEigenvaluesSigned(partialTransposeB(rho));
      let oneNorm = 0;
      for (const e of ev) oneNorm += Math.abs(e);
      const en = Math.max(0, Math.log2(oneNorm)); // ≥ 0; 0 when PPT
      neg[i][j] = en;
      neg[j][i] = en;
      if (en > maxNeg) maxNeg = en;
    }
  }
  return { neg, maxNeg, numQubits: n };
}
