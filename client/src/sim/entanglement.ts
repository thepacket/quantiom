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
 * Eigenvalues of a complex Hermitian density matrix, sorted descending.
 * Computed via the real symmetric embedding [[A, −B], [B, A]] (ρ = A + iB):
 * that 2d×2d real matrix has each eigenvalue of ρ exactly twice, so we take
 * every other value after sorting to recover the d eigenvalues.
 */
export function densityEigenvalues(rho: Complex[][]): number[] {
  const d = rho.length;
  const M: number[][] = Array.from({ length: 2 * d }, () => new Array<number>(2 * d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const a = rho[i][j].re, b = rho[i][j].im;
      M[i][j] = a; M[i][j + d] = -b;
      M[i + d][j] = b; M[i + d][j + d] = a;
    }
  }
  const ev = symEigenvalues(M).sort((p, q) => q - p);
  // The 2d embedding eigenvalues pair up; take one of each (even indices).
  const out: number[] = [];
  for (let k = 0; k < 2 * d; k += 2) out.push(Math.max(0, ev[k]));
  return out;
}

/** Von Neumann entropy S(ρ) = −Σ p log₂ p, in bits. */
export function vonNeumannEntropy(rho: Complex[][]): number {
  let s = 0;
  for (const p of densityEigenvalues(rho)) {
    if (p > 1e-12) s += p * Math.log2(p);
  }
  return -s;
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

export type EntropyProfileResult = {
  /** entropy[k] = S(ρ_{[0..k]}) for the contiguous cut after qubit k, in
   *  bits; length n−1 (k = 0 … n−2). cut k separates {0..k} | {k+1..n−1}. */
  entropy: number[];
  /** Page-curve bound at each cut: min(|A|, |B|) bits. Same length. */
  maxEntropy: number[];
};

/**
 * Entanglement-entropy profile across every contiguous bipartition. For a
 * pure state this is S(ρ_{[0..k]}) as a function of the cut position k —
 * the standard area-law vs volume-law diagnostic. A product state is flat
 * at zero; a ground state of a gapped local Hamiltonian saturates (area
 * law); a thermalised / volume-law state traces the symmetric Page arch
 * peaking at the middle cut.
 *
 * Cost: one reduced-DM diagonalisation per cut, each capped by the smaller
 * side. We diagonalise whichever side of the cut is smaller and skip any
 * cut whose smaller side exceeds `maxSide`, leaving its entry NaN so the
 * panel can render a gap. Statevector path only.
 */
export function entropyProfile(
  state: Float64Array,
  n: number,
  maxSide = 8,
): EntropyProfileResult | null {
  if (n < 2) return null;
  const entropy = new Array<number>(n - 1).fill(NaN);
  const maxEntropy = new Array<number>(n - 1).fill(0);
  for (let k = 0; k < n - 1; k++) {
    const sizeA = k + 1;
    const sizeB = n - sizeA;
    maxEntropy[k] = Math.min(sizeA, sizeB);
    // Diagonalise the smaller side; ρ_A and ρ_B share the non-zero spectrum.
    const side =
      sizeA <= sizeB
        ? Array.from({ length: sizeA }, (_, q) => q)
        : Array.from({ length: sizeB }, (_, q) => sizeA + q);
    if (side.length > maxSide) continue;
    let s = 0;
    for (const p of densityEigenvalues(reducedDensityMatrix(state, n, side))) {
      if (p > 1e-12) s -= p * Math.log2(p);
    }
    entropy[k] = s;
  }
  return { entropy, maxEntropy };
}

export type SchmidtResult = {
  /** Entanglement spectrum: the squared Schmidt coefficients (eigenvalues
   *  of ρ_A), sorted descending and summing to 1. */
  spectrum: number[];
  /** Bipartite von Neumann entanglement entropy S(ρ_A) in bits. */
  entropy: number;
  /** Schmidt rank: number of coefficients above 1e-9. */
  rank: number;
};

/**
 * Schmidt / entanglement spectrum across the cut A | (rest). For a pure
 * state the squared Schmidt coefficients are the eigenvalues of the
 * reduced density matrix ρ_A. We diagonalise the smaller side (ρ_A and
 * ρ_B share the same non-zero spectrum), so the cost is set by
 * min(|A|, n−|A|); capped at `maxSide` qubits on that side.
 */
export function entanglementSpectrum(
  state: Float64Array,
  n: number,
  subsetA: number[],
  maxSide = 6,
): SchmidtResult | null {
  if (subsetA.length === 0 || subsetA.length >= n) return null;
  const inA = new Set(subsetA);
  const complement: number[] = [];
  for (let q = 0; q < n; q++) if (!inA.has(q)) complement.push(q);
  // Diagonalise whichever side is smaller.
  const side = subsetA.length <= complement.length ? subsetA : complement;
  if (side.length > maxSide) return null;
  const rho = reducedDensityMatrix(state, n, side);
  const spectrum = densityEigenvalues(rho);
  let entropy = 0;
  let rank = 0;
  for (const p of spectrum) {
    if (p > 1e-12) entropy -= p * Math.log2(p);
    if (p > 1e-9) rank += 1;
  }
  return { spectrum, entropy, rank };
}
