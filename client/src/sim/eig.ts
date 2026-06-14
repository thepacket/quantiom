/**
 * Shared dense eigensolvers used by the analysis panels that need
 * eigenvectors (not just eigenvalues): a real-symmetric cyclic-Jacobi routine
 * and a complex-Hermitian solver built on the real-symmetric embedding
 * [[A, −B], [B, A]] (ρ = A + iB). Small dimensions only — these are O(d³) per
 * sweep, so callers cap n.
 */

import type { Complex } from "./density";

/** Real-symmetric eigensolver (cyclic Jacobi) with eigenvectors as columns. */
export function jacobiSym(Ain: number[][]): { values: number[]; vectors: number[][] } {
  const n = Ain.length;
  const A = Ain.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) as number),
  );
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-26) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q], apq = A[p][q];
        let c: number, s: number;
        if (Math.abs(aqq - app) < 1e-30) {
          c = Math.SQRT1_2; s = (apq >= 0 ? 1 : -1) * Math.SQRT1_2;
        } else {
          const theta = (aqq - app) / (2 * apq);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
          c = 1 / Math.sqrt(1 + t * t); s = t * c;
        }
        for (let i = 0; i < n; i++) {
          const aip = A[i][p], aiq = A[i][q];
          A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq;
        }
        for (let j = 0; j < n; j++) {
          const apj = A[p][j], aqj = A[q][j];
          A[p][j] = c * apj - s * aqj; A[q][j] = s * apj + c * aqj;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => A[i][i]), vectors: V };
}

/** Eigen-decomposition of a complex Hermitian matrix via the real-symmetric
 *  embedding; returns the d eigenvalues (ascending) + complex eigenvectors. */
export function hermitianEig(H: Complex[][]): { values: number[]; vectors: Complex[][] } {
  const d = H.length;
  const M: number[][] = Array.from({ length: 2 * d }, () => new Array<number>(2 * d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const a = H[i][j].re, b = H[i][j].im;
      M[i][j] = a; M[i][j + d] = -b;
      M[i + d][j] = b; M[i + d][j + d] = a;
    }
  }
  const { values, vectors } = jacobiSym(M);
  const order = Array.from({ length: 2 * d }, (_, i) => i).sort((p, q) => values[p] - values[q]);
  const outVals: number[] = [];
  const outVecs: Complex[][] = [];
  for (let k = 0; k < 2 * d; k += 2) {
    const col = order[k];
    outVals.push(values[col]);
    const v: Complex[] = new Array(d);
    let norm = 0;
    for (let i = 0; i < d; i++) {
      const re = vectors[i][col], im = vectors[i + d][col];
      v[i] = { re, im };
      norm += re * re + im * im;
    }
    const inv = norm > 1e-300 ? 1 / Math.sqrt(norm) : 0;
    for (let i = 0; i < d; i++) { v[i].re *= inv; v[i].im *= inv; }
    outVecs.push(v);
  }
  return { values: outVals, vectors: outVecs };
}

/** Eigenvalues of a real symmetric 3×3 matrix (analytic), ascending. */
export function eig3(M: number[][]): number[] {
  const p1 = M[0][1] ** 2 + M[0][2] ** 2 + M[1][2] ** 2;
  const tr = M[0][0] + M[1][1] + M[2][2];
  if (p1 < 1e-18) return [M[0][0], M[1][1], M[2][2]].sort((a, b) => a - b);
  const q = tr / 3;
  const p2 = (M[0][0] - q) ** 2 + (M[1][1] - q) ** 2 + (M[2][2] - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const B = M.map((row, i) => row.map((v, j) => (v - (i === j ? q : 0)) / p));
  const detB =
    B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1]) -
    B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0]) +
    B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]);
  let r = detB / 2;
  r = Math.max(-1, Math.min(1, r));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi);
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  const e2 = 3 * q - e1 - e3;
  return [e3, e2, e1].sort((a, b) => a - b);
}
