/**
 * Pauli transfer matrix (PTM) of the circuit's unitary. The PTM represents
 * a channel in the (normalised) Pauli basis:
 *
 *   R_{ij} = (1/2ⁿ) Tr( P_i · U P_j U† )
 *
 * a 4ⁿ × 4ⁿ real matrix. It's the standard "what does this operation do to
 * each Pauli" picture: a Clifford gate is a signed permutation matrix (each
 * Pauli maps to ±another Pauli); a T gate mixes within the X–Y block; the
 * (I,I) corner is always 1. Sibling of the unitary heatmap (operator in the
 * computational basis) and the χ-matrix (process tomography).
 *
 * Built from the dense unitary (columns via `simulate` with `startIndex`),
 * capped tightly because the matrix is 4ⁿ × 4ⁿ.
 */

import { simulate, type ParameterValues } from "./simulate";
import { pauliSparse } from "./pauliMatrix";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type PTMResult = {
  /** 4ⁿ × 4ⁿ real matrix, row-major; entries in [−1, 1]. */
  R: number[][];
  /** Pauli-string labels for rows/cols (e.g. "II", "IX", …). */
  labels: string[];
  size: number;
};

const PCHARS = ["I", "X", "Y", "Z"];

function pauliLabel(n: number, k: number): string {
  // qubit 0 is the most-significant base-4 digit (matches big-endian strings).
  let s = "";
  for (let q = 0; q < n; q++) {
    s += PCHARS[(k >> (2 * (n - 1 - q))) & 3];
  }
  return s;
}

export function pauliTransferMatrix(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  maxQubits = 3,
): PTMResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  const nP = 4 ** n;

  // Dense unitary U (re/im), row-major dim×dim. Column j = simulate(|j⟩).
  const Ure = new Float64Array(dim * dim);
  const Uim = new Float64Array(dim * dim);
  for (let j = 0; j < dim; j++) {
    const psi = simulate(circuit, paramValues, customGates, { startIndex: j }).state;
    for (let i = 0; i < dim; i++) {
      Ure[i * dim + j] = psi[2 * i];
      Uim[i * dim + j] = psi[2 * i + 1];
    }
  }

  const labels = Array.from({ length: nP }, (_, k) => pauliLabel(n, k));
  const sparse = labels.map((s) => pauliSparse(n, s));
  const R: number[][] = Array.from({ length: nP }, () => new Array<number>(nP).fill(0));

  // For each P_j, form M = U P_j U† (dense), then R_{ij} = Tr(P_i M)/dim.
  const Mre = new Float64Array(dim * dim);
  const Mim = new Float64Array(dim * dim);
  for (let j = 0; j < nP; j++) {
    const { perm, phRe, phIm } = sparse[j];
    // A = U P_j : column c of A = ph[c] · (column perm[c] of U).
    // M = A U† : M[i][b] = Σ_c A[i][c] · conj(U[b][c]).
    // Compute A on the fly into M.
    Mre.fill(0); Mim.fill(0);
    // Precompute A (dim×dim).
    const Are = new Float64Array(dim * dim);
    const Aim = new Float64Array(dim * dim);
    for (let c = 0; c < dim; c++) {
      const pr = phRe[c], pi = phIm[c], col = perm[c];
      for (let i = 0; i < dim; i++) {
        const ur = Ure[i * dim + col], ui = Uim[i * dim + col];
        Are[i * dim + c] = ur * pr - ui * pi;
        Aim[i * dim + c] = ur * pi + ui * pr;
      }
    }
    for (let i = 0; i < dim; i++) {
      for (let b = 0; b < dim; b++) {
        let mr = 0, mi = 0;
        for (let c = 0; c < dim; c++) {
          const ar = Are[i * dim + c], ai = Aim[i * dim + c];
          // conj(U[b][c]) = Ure - i Uim
          const ur = Ure[b * dim + c], ui = -Uim[b * dim + c];
          mr += ar * ur - ai * ui;
          mi += ar * ui + ai * ur;
        }
        Mre[i * dim + b] = mr;
        Mim[i * dim + b] = mi;
      }
    }
    // Tr(P_i M) = Σ_{a,r} (P_i)[a][r] M[r][a] = Σ_r ph_i[r] · M[r][perm_i[r]].
    for (let i = 0; i < nP; i++) {
      const pi = sparse[i];
      let re = 0;
      for (let r = 0; r < dim; r++) {
        const col = pi.perm[r];
        const mr = Mre[r * dim + col], mi = Mim[r * dim + col];
        const pr = pi.phRe[r], pim = pi.phIm[r];
        re += pr * mr - pim * mi;
      }
      R[i][j] = re / dim;
    }
  }

  return { R, labels, size: nP };
}
