/**
 * Entanglement structure from a pure state: per-qubit von Neumann entropy
 * and the pairwise quantum mutual information matrix.
 *
 *   I(i:j) = S(ρ_i) + S(ρ_j) − S(ρ_ij)
 *
 * Mutual information captures total (classical + quantum) correlation
 * between two qubits; for a pure global state a non-zero I(i:j) means the
 * pair shares correlation with the rest of the register. The map reveals
 * entanglement topology at a glance — GHZ is all-to-all, a cluster state
 * is nearest-neighbour, a Trotterised chain shows a spreading front.
 *
 * Single-qubit S(ρ_i) ∈ [0, 1] bit; pairwise I(i:j) ∈ [0, 2] bits.
 */

import { reducedDensityMatrix, type Complex } from "./density";

/** Eigenvalues of a real symmetric matrix via cyclic Jacobi rotations.
 *  Values only (no eigenvectors). Reliable at the small sizes here. */
function symEigenvalues(Ain: number[][]): number[] {
  const n = Ain.length;
  if (n === 0) return [];
  if (n === 1) return [Ain[0][0]];
  const A = Ain.map((row) => [...row]);
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
      }
    }
  }
  return Array.from({ length: n }, (_, i) => A[i][i]);
}

/**
 * Von Neumann entropy S(ρ) = −Tr(ρ log₂ ρ), in bits. ρ is a complex
 * Hermitian density matrix. Computed from its eigenvalues via the real
 * symmetric embedding [[A, −B], [B, A]] (ρ = A + iB): that 2d×2d real
 * matrix has each eigenvalue of ρ exactly twice, so summing over all of
 * them and halving recovers the entropy.
 */
export function vonNeumannEntropy(rho: Complex[][]): number {
  const d = rho.length;
  const M: number[][] = Array.from({ length: 2 * d }, () => new Array<number>(2 * d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const a = rho[i][j].re, b = rho[i][j].im;
      M[i][j] = a; M[i][j + d] = -b;
      M[i + d][j] = b; M[i + d][j + d] = a;
    }
  }
  const ev = symEigenvalues(M);
  let s = 0;
  for (const lam of ev) {
    if (lam > 1e-12) s += lam * Math.log2(lam);
  }
  return -0.5 * s;
}

export type MutualInfoResult = {
  /** n×n symmetric matrix; mi[i][j] = I(i:j) in bits, diagonal = 0. */
  mi: number[][];
  /** Per-qubit von Neumann entropy S(ρ_i) in bits (entanglement of qubit i
   *  with the rest of the register). */
  single: number[];
};

/**
 * Pairwise mutual-information matrix of a pure state. Caps at `maxQubits`
 * (the work is C(n,2) two-qubit partial traces, each O(2ⁿ)); returns null
 * past the cap so the panel can show a notice instead of stalling.
 */
export function mutualInformationMatrix(
  state: Float64Array,
  n: number,
  maxQubits = 12,
): MutualInfoResult | null {
  if (n < 1 || n > maxQubits) return null;
  const single = new Array<number>(n);
  for (let q = 0; q < n; q++) {
    single[q] = vonNeumannEntropy(reducedDensityMatrix(state, n, [q]));
  }
  const mi: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sij = vonNeumannEntropy(reducedDensityMatrix(state, n, [i, j]));
      const info = Math.max(0, single[i] + single[j] - sij);
      mi[i][j] = info;
      mi[j][i] = info;
    }
  }
  return { mi, single };
}
