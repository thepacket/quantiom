/**
 * Pairwise Wootters concurrence — an entanglement-of-formation measure for
 * the two-qubit reduced state of every pair of qubits.
 *
 * For a 2-qubit density matrix ρ, the spin-flipped state is
 *   ρ̃ = (σ_y ⊗ σ_y) ρ* (σ_y ⊗ σ_y),
 * and the concurrence is
 *   C(ρ) = max(0, √λ₁ − √λ₂ − √λ₃ − √λ₄),
 * where λ₁ ≥ … ≥ λ₄ are the eigenvalues of R = ρ ρ̃ (real, ≥ 0). C ∈ [0, 1];
 * 0 = separable, 1 = a maximally entangled (Bell) pair. Unlike the
 * partial-transpose negativity, concurrence is a faithful entanglement-of-
 * formation monotone for two qubits, so the two maps are complementary.
 *
 * The λ are obtained as the eigenvalues of the Hermitian PSD matrix
 * √ρ · ρ̃ · √ρ (same spectrum as ρρ̃), using a Jacobi eigendecomposition of ρ
 * to form √ρ. O(2ⁿ) per pair for the partial trace; C(n,2) pairs.
 */

import { reducedDensityMatrix, type Complex } from "./density";
import { densityEigenvalues } from "./entanglement";

export type ConcurrenceResult = {
  /** c[i][j] = concurrence of the (i,j) reduced pair (symmetric, 0 diagonal). */
  c: number[][];
  numQubits: number;
  /** Largest pairwise concurrence. */
  max: number;
};

export const MAX_CONCURRENCE_QUBITS = 10;

// σ_y ⊗ σ_y as a real 4×4 matrix (it is real: i·i = −1 cancels the i's).
const YY: number[][] = [
  [0, 0, 0, -1],
  [0, 0, 1, 0],
  [0, 1, 0, 0],
  [-1, 0, 0, 0],
];

type C = Complex;
const cAdd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

function matMul(A: C[][], B: C[][]): C[][] {
  const n = A.length, m = B[0].length, k = B.length;
  const out: C[][] = Array.from({ length: n }, () => Array.from({ length: m }, () => ({ re: 0, im: 0 })));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let acc: C = { re: 0, im: 0 };
      for (let p = 0; p < k; p++) acc = cAdd(acc, cMul(A[i][p], B[p][j]));
      out[i][j] = acc;
    }
  return out;
}

/** Real-symmetric Jacobi returning eigenvalues and eigenvectors (columns of V). */
function jacobiSym(Ain: number[][]): { values: number[]; vectors: number[][] } {
  const n = Ain.length;
  const A = Ain.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-28) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q];
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
          A[i][p] = c * aip - s * aiq;
          A[i][q] = s * aip + c * aiq;
        }
        for (let j = 0; j < n; j++) {
          const apj = A[p][j], aqj = A[q][j];
          A[p][j] = c * apj - s * aqj;
          A[q][j] = s * apj + c * aqj;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p], viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => A[i][i]), vectors: V };
}

/**
 * √ρ for a Hermitian PSD ρ. The real embedding J(ρ) = M = [[A,−B],[B,A]] is a
 * *-algebra homomorphism, so J(√ρ) = √M. We compute √M = V diag(√λ) Vᵀ from a
 * robust real-symmetric Jacobi (degeneracy-safe — no complex-eigenvector
 * deduping), then read √ρ back out of its [[A',−B'],[B',A']] block structure.
 */
function sqrtHermitian(rho: C[][]): C[][] {
  const d = rho.length;
  const D = 2 * d;
  const M: number[][] = Array.from({ length: D }, () => new Array<number>(D).fill(0));
  for (let i = 0; i < d; i++)
    for (let j = 0; j < d; j++) {
      const a = rho[i][j].re, b = rho[i][j].im;
      M[i][j] = a; M[i][j + d] = -b;
      M[i + d][j] = b; M[i + d][j + d] = a;
    }
  const { values, vectors } = jacobiSym(M);
  // √M_{ij} = Σ_k V_{ik} √λ_k V_{jk}.
  const sq = values.map((x) => Math.sqrt(Math.max(0, x)));
  const sqrtM: number[][] = Array.from({ length: D }, () => new Array<number>(D).fill(0));
  for (let i = 0; i < D; i++)
    for (let j = 0; j < D; j++) {
      let acc = 0;
      for (let k = 0; k < D; k++) acc += vectors[i][k] * sq[k] * vectors[j][k];
      sqrtM[i][j] = acc;
    }
  // √ρ = A' + iB' with A' = top-left block, B' = bottom-left block.
  const out: C[][] = Array.from({ length: d }, () => Array.from({ length: d }, () => ({ re: 0, im: 0 })));
  for (let i = 0; i < d; i++)
    for (let j = 0; j < d; j++) out[i][j] = { re: sqrtM[i][j], im: sqrtM[i + d][j] };
  return out;
}

/** Wootters concurrence of a single 4×4 two-qubit density matrix. */
export function concurrence(rho: C[][]): number {
  // ρ̃ = YY · ρ* · YY (YY real, symmetric).
  const conj: C[][] = rho.map((row) => row.map((e) => ({ re: e.re, im: -e.im })));
  const YYc: C[][] = YY.map((row) => row.map((x) => ({ re: x, im: 0 })));
  const rhoTilde = matMul(matMul(YYc, conj), YYc);
  const sr = sqrtHermitian(rho);
  // R' = √ρ · ρ̃ · √ρ (Hermitian, same spectrum as ρρ̃).
  const Rp = matMul(matMul(sr, rhoTilde), sr);
  const eig = densityEigenvalues(Rp).sort((a, b) => b - a); // descending, clamped ≥ 0
  const r = eig.map((x) => Math.sqrt(Math.max(0, x)));
  while (r.length < 4) r.push(0);
  return Math.max(0, r[0] - r[1] - r[2] - r[3]);
}

/** Pairwise concurrence matrix of a pure state. */
export function concurrenceMatrix(state: Float64Array, n: number): ConcurrenceResult | null {
  if (n < 2 || n > MAX_CONCURRENCE_QUBITS) return null;
  const c: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let max = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rho = reducedDensityMatrix(state, n, [i, j]);
      const val = concurrence(rho);
      c[i][j] = val;
      c[j][i] = val;
      if (val > max) max = val;
    }
  }
  return { c, numQubits: n, max };
}
