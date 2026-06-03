import type { Complex } from "./complex";
import { cmul, neg } from "./complex";

/**
 * Cartan KAK decomposition of an arbitrary 4×4 unitary into
 *
 *   U ≈ e^{iφ} · (A1 ⊗ A2) · RXX(2α) · RYY(2β) · RZZ(2γ) · (B1 ⊗ B2)
 *
 * The four single-qubit factors are emitted as `u3` gates and the
 * interaction core uses the IR's native `rxx`, `ryy`, `rzz` primitives.
 * Each Rxx/Ryy/Rzz lowers to 2 CNOT + 1q rotations under a CX-based
 * transpile target, so the total CX count after transpile is ≈ 6.
 *
 * Algorithm — a faithful port of Cirq's magic-basis KAK
 * (`cirq.linalg.decompositions.kak_decomposition` plus the diagonalize
 * helpers it relies on). The earlier home-grown Autonne-Takagi path
 * couldn't resolve eigenvectors inside degenerate eigenvalue blocks of
 * Σ = UₘᵀUₘ (CNOT, most Haar unitaries); Cirq sidesteps that by
 * bidiagonalising Re(Uₘ) and Im(Uₘ) directly — when one of them is
 * fully degenerate, its diagonalisation freedom is exactly what's used
 * to fully diagonalise the other.
 *
 * Pipeline:
 *   1. Uₘ = M† U M           (M = magic basis).
 *   2. (L, d, R) = bidiagonalise Uₘ with special-orthogonal L, R so that
 *      L Uₘ R = diag(d), d unit-modulus complex.
 *   3. (a1, a0) = SU(2) factors of Lᵀ in the magic basis; likewise
 *      (b1, b0) from Rᵀ.
 *   4. (w, x, y, z) = KAK_GAMMA · angle(d). The interaction is
 *      e^{iw}·exp(i(x·XX + y·YY + z·ZZ)); KAK_GAMMA is the inverse of the
 *      magic-basis ±-sign pattern of XX/YY/ZZ, so the reconstruction
 *      U = (a1⊗a0)·[M diag(d) M†]·(b1⊗b0) is exact.
 *
 * Big-endian qubit order (qubit 0 = MSB of the 4-dim index). Output qubit
 * indices 0/1 refer to the two qubits of the input gate. Returns null when
 * the achieved residual exceeds tolerance (caller falls back to applying U
 * as a single 4×4 block).
 */

export type Gate1Q = { kind: "u3"; theta: number; phi: number; lambda: number; qubit: 0 | 1 };
export type GateIsing = { kind: "rxx" | "ryy" | "rzz"; theta: number };
export type KakGate = Gate1Q | GateIsing;

export type KakResult = {
  gates: KakGate[];
  interaction: { alpha: number; beta: number; gamma: number };
  /** Max element-wise |U - U_recovered| after factoring out global phase. */
  residual: number;
};

const TOL = 1e-6;

// ─── Magic basis (identical to Cirq's MAGIC) ────────────────────────────

const SQRT2_INV = 1 / Math.SQRT2;
function magicBasis(): Complex[][] {
  // M = (1/√2) · [[1, 0, 0, i],
  //                [0, i, 1, 0],
  //                [0, i, -1, 0],
  //                [1, 0, 0, -i]]
  const i: Complex = [0, 1];
  const ni: Complex = [0, -1];
  const one: Complex = [1, 0];
  const z: Complex = [0, 0];
  const raw: Complex[][] = [
    [one, z, z, i],
    [z, i, one, z],
    [z, i, [-1, 0], z],
    [one, z, z, ni],
  ];
  return raw.map((row) => row.map((e) => [e[0] * SQRT2_INV, e[1] * SQRT2_INV] as Complex));
}

// KAK_GAMMA = 0.25 · [[1,1,1,1],[1,1,-1,-1],[-1,1,-1,1],[1,-1,-1,1]].
// Maps the four magic-basis eigenphases to (w, x, y, z); it is the inverse
// of the XX/YY/ZZ magic-basis sign pattern, valid because magicBasis()
// equals Cirq's MAGIC entry-for-entry.
const KAK_GAMMA: number[][] = [
  [1, 1, 1, 1],
  [1, 1, -1, -1],
  [-1, 1, -1, 1],
  [1, -1, -1, 1],
].map((row) => row.map((v) => v * 0.25));

// ─── Complex / real matrix primitives ───────────────────────────────────

function matMul(A: Complex[][], B: Complex[][]): Complex[][] {
  const n = A.length, m = B[0].length, k = B.length;
  const out: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: m }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let l = 0; l < k; l++) {
        const a = A[i][l], b = B[l][j];
        re += a[0] * b[0] - a[1] * b[1];
        im += a[0] * b[1] + a[1] * b[0];
      }
      out[i][j] = [re, im];
    }
  }
  return out;
}

function dagger(A: Complex[][]): Complex[][] {
  const n = A.length, m = A[0].length;
  const out: Complex[][] = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = [A[i][j][0], -A[i][j][1]];
  return out;
}

function transposeReal(A: number[][]): number[][] {
  const n = A.length, m = A[0].length;
  const out: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = A[i][j];
  return out;
}

function realMul(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0].length, k = B.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let l = 0; l < k; l++) s += A[i][l] * B[l][j];
      out[i][j] = s;
    }
  return out;
}

function identityReal(n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) out[i][i] = 1;
  return out;
}

function toComplexMat(A: number[][]): Complex[][] {
  return A.map((row) => row.map((v) => [v, 0] as Complex));
}

/**
 * Jacobi eigenvalue algorithm for a real symmetric matrix. Returns (D, V)
 * with A = V diag(D) Vᵀ (so Vᵀ A V = diag(D)). Reliable at small n.
 */
function jacobiEigen(Ain: number[][], tol = 1e-13): { D: number[]; V: number[][] } {
  const n = Ain.length;
  if (n === 1) return { D: [Ain[0][0]], V: [[1]] };
  const A = Ain.map((row) => [...row]);
  const V = identityReal(n);
  for (let iter = 0; iter < 200; iter++) {
    let p = 0, q = 1, maxOff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(A[i][j]);
        if (v > maxOff) { maxOff = v; p = i; q = j; }
      }
    }
    if (maxOff < tol) break;
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];
    let cs: number, sn: number;
    if (Math.abs(aqq - app) < 1e-30) {
      cs = Math.SQRT1_2;
      sn = (apq >= 0 ? 1 : -1) * Math.SQRT1_2;
    } else {
      const theta = (aqq - app) / (2 * apq);
      const tsign = theta >= 0 ? 1 : -1;
      const t = tsign / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
      cs = 1 / Math.sqrt(1 + t * t);
      sn = t * cs;
    }
    for (let i = 0; i < n; i++) {
      const aip = A[i][p], aiq = A[i][q];
      A[i][p] = cs * aip - sn * aiq;
      A[i][q] = sn * aip + cs * aiq;
    }
    for (let j = 0; j < n; j++) {
      const apj = A[p][j], aqj = A[q][j];
      A[p][j] = cs * apj - sn * aqj;
      A[q][j] = sn * apj + cs * aqj;
    }
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = cs * vip - sn * viq;
      V[i][q] = sn * vip + cs * viq;
    }
  }
  const D = new Array<number>(n);
  for (let i = 0; i < n; i++) D[i] = A[i][i];
  return { D, V };
}

// ─── Real SVD (built from the symmetric eigensolver) ────────────────────

/**
 * SVD of a real square matrix: A = U · diag(s) · Vᵀ with U, V orthogonal
 * and s in DESCENDING order (matching numpy's convention, which Cirq's
 * bidiagonalisation relies on). Zero-singular-value columns of U are
 * completed to a full orthonormal basis.
 */
function svdReal(A: number[][]): { U: number[][]; s: number[]; Vt: number[][] } {
  const n = A.length;
  const AtA = realMul(transposeReal(A), A);
  const { D, V } = jacobiEigen(AtA); // AtA = V diag(D) Vᵀ
  const order = D.map((_, i) => i).sort((a, b) => D[b] - D[a]);
  const s = order.map((i) => Math.sqrt(Math.max(D[i], 0)));
  const Vord: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Vord[i][j] = V[i][order[j]];

  const U: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const filled: boolean[] = new Array(n).fill(false);
  for (let j = 0; j < n; j++) {
    if (s[j] > 1e-12) {
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc += A[i][k] * Vord[k][j];
        U[i][j] = acc / s[j];
      }
      filled[j] = true;
    }
  }
  completeOrthonormalColumns(U, filled);
  return { U, s, Vt: transposeReal(Vord) };
}

/**
 * Fill the unfilled columns of U (marked false in `filled`) with vectors
 * that extend the filled columns to a full orthonormal basis. Gram-Schmidt
 * standard basis vectors against the existing columns, picking the one with
 * the largest residual at each step.
 */
function completeOrthonormalColumns(U: number[][], filled: boolean[]): void {
  const n = U.length;
  const basis: number[][] = [];
  for (let j = 0; j < n; j++) if (filled[j]) basis.push(U.map((row) => row[j]));
  for (let j = 0; j < n; j++) {
    if (filled[j]) continue;
    let best: number[] | null = null;
    let bestNorm = -1;
    for (let e = 0; e < n; e++) {
      const v = new Array<number>(n).fill(0);
      v[e] = 1;
      for (const b of basis) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += b[i] * v[i];
        for (let i = 0; i < n; i++) v[i] -= dot * b[i];
      }
      let nrm = 0;
      for (let i = 0; i < n; i++) nrm += v[i] * v[i];
      nrm = Math.sqrt(nrm);
      if (nrm > bestNorm) { bestNorm = nrm; best = v; }
    }
    const v = best!;
    for (let i = 0; i < n; i++) v[i] /= bestNorm;
    basis.push(v);
    for (let i = 0; i < n; i++) U[i][j] = v[i];
  }
}

// ─── Cirq diagonalize helpers ───────────────────────────────────────────

/**
 * Orthogonal P with Pᵀ·symmetric·P diagonal AND Pᵀ·diag·P = diag (the
 * descending diagonal is preserved). Port of Cirq's
 * `diagonalize_real_symmetric_and_sorted_diagonal_matrices`: split into
 * contiguous blocks where the sorted diagonal is ~constant, diagonalise the
 * symmetric matrix within each block.
 */
function diagonalizeRealSymmetricAndSortedDiagonal(
  symmetric: number[][],
  diagDesc: number[],
): number[][] {
  const n = symmetric.length;
  const P = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8 + 1e-5 * Math.abs(b);
  let start = 0;
  while (start < n) {
    let end = start + 1;
    while (end < n && near(diagDesc[start], diagDesc[end])) end++;
    const m = end - start;
    const block = Array.from({ length: m }, (_, r) =>
      Array.from({ length: m }, (_, c) => symmetric[start + r][start + c]),
    );
    const { V } = jacobiEigen(block);
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) P[start + r][start + c] = V[r][c];
    start = end;
  }
  return P;
}

function blockDiagReal(A: number[][], B: number[][]): number[][] {
  const na = A.length, nb = B.length;
  const out = Array.from({ length: na + nb }, () => new Array<number>(na + nb).fill(0));
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) out[i][j] = A[i][j];
  for (let i = 0; i < nb; i++) for (let j = 0; j < nb; j++) out[na + i][na + j] = B[i][j];
  return out;
}

/** Submatrix rows/cols [lo, hi). */
function subMatrix(A: number[][], lo: number, hi: number): number[][] {
  const m = hi - lo;
  return Array.from({ length: m }, (_, r) =>
    Array.from({ length: m }, (_, c) => A[lo + r][lo + c]),
  );
}

/**
 * Port of Cirq's `bidiagonalize_real_matrix_pair_with_symmetric_products`.
 * Finds orthogonal L, R with both L·mat1·R and L·mat2·R diagonal.
 * Precondition (guaranteed for mat1/mat2 = Re/Im of a unitary): mat1·mat2ᵀ
 * and mat1ᵀ·mat2 are symmetric.
 */
function bidiagonalizeRealPair(
  mat1: number[][],
  mat2: number[][],
): { L: number[][]; R: number[][] } {
  const n = mat1.length;
  const { U: baseLeft, s: baseDiag, Vt: baseRight } = svdReal(mat1);

  // Rank = number of non-negligible singular values (descending, so the
  // small ones are at the tail).
  let rank = n;
  while (rank > 0 && Math.abs(baseDiag[rank - 1]) <= 1e-8) rank -= 1;

  // semi_corrected = baseLeftᵀ · mat2 · baseRightᵀ
  const semi = realMul(transposeReal(baseLeft), realMul(mat2, transposeReal(baseRight)));

  // Matched block: simultaneously diagonalise with the (constant-within-
  // degenerate-block) singular values.
  const overlap = subMatrix(semi, 0, rank);
  // Symmetrise defensively against round-off before eigh.
  for (let i = 0; i < rank; i++)
    for (let j = i + 1; j < rank; j++) {
      const avg = (overlap[i][j] + overlap[j][i]) / 2;
      overlap[i][j] = avg; overlap[j][i] = avg;
    }
  const overlapAdjust = diagonalizeRealSymmetricAndSortedDiagonal(
    overlap, baseDiag.slice(0, rank),
  );

  // Unmatched (zero-singular) block: plain SVD.
  let extraLeft: number[][], extraRight: number[][];
  if (rank < n) {
    const extra = subMatrix(semi, rank, n);
    const e = svdReal(extra);
    extraLeft = e.U;
    extraRight = e.Vt;
  } else {
    extraLeft = []; extraRight = [];
  }

  const leftAdjust = rank < n ? blockDiagReal(overlapAdjust, extraLeft) : overlapAdjust;
  const rightAdjust = rank < n
    ? blockDiagReal(transposeReal(overlapAdjust), extraRight)
    : transposeReal(overlapAdjust);

  const L = realMul(transposeReal(leftAdjust), transposeReal(baseLeft));
  const R = realMul(transposeReal(baseRight), transposeReal(rightAdjust));
  return { L, R };
}

/**
 * Port of Cirq's `bidiagonalize_unitary_with_special_orthogonals`.
 * Returns special-orthogonal L, R (det = +1) and the complex diagonal d
 * with L · Um · R = diag(d).
 */
function bidiagonalizeUnitarySpecialOrthogonal(
  Um: Complex[][],
): { L: number[][]; d: Complex[]; R: number[][] } {
  const n = Um.length;
  const re = Um.map((row) => row.map((e) => e[0]));
  const im = Um.map((row) => row.map((e) => e[1]));
  const { L, R } = bidiagonalizeRealPair(re, im);

  // Force special-orthogonal without breaking the diagonalisation.
  if (det4(L) < 0) for (let j = 0; j < n; j++) L[0][j] = -L[0][j];
  if (det4(R) < 0) for (let i = 0; i < n; i++) R[i][0] = -R[i][0];

  const diagM = matMul(toComplexMat(L), matMul(Um, toComplexMat(R)));
  const d: Complex[] = [];
  for (let k = 0; k < n; k++) d.push(diagM[k][k]);
  return { L, d, R };
}

// ─── SO(4) → SU(2) ⊗ SU(2) ──────────────────────────────────────────────

function det2c(m: Complex[][]): Complex {
  const ad = cmul(m[0][0], m[1][1]);
  const bc = cmul(m[0][1], m[1][0]);
  return [ad[0] - bc[0], ad[1] - bc[1]];
}

function csqrt(z: Complex): Complex {
  const r = Math.hypot(z[0], z[1]);
  if (r < 1e-300) return [0, 0];
  const theta = Math.atan2(z[1], z[0]);
  const sr = Math.sqrt(r);
  return [sr * Math.cos(theta / 2), sr * Math.sin(theta / 2)];
}

function cinv(z: Complex): Complex {
  const m = z[0] * z[0] + z[1] * z[1];
  if (m < 1e-300) return [0, 0];
  return [z[0] / m, -z[1] / m];
}

/**
 * Port of Cirq's `kron_factor_4x4_to_2x2s`: split a 4×4 matrix that is the
 * kronecker product of two 2×2 unitaries into (g, f1, f2) with
 * matrix = g · kron(f1, f2), f1/f2 unit-determinant. Returns null if the
 * matrix is not (close to) a tensor product.
 */
function kronFactor4x4(
  matrix: Complex[][],
): { g: Complex; f1: Complex[][]; f2: Complex[][] } | null {
  // Reference cell: entry with the largest magnitude.
  let a = 0, b = 0, bestMag = -1;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const m = matrix[i][j][0] ** 2 + matrix[i][j][1] ** 2;
    if (m > bestMag) { bestMag = m; a = i; b = j; }
  }
  if (bestMag < 1e-24) return null;

  const f1: Complex[][] = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
  const f2: Complex[][] = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      f1[((a >> 1) ^ i)][((b >> 1) ^ j)] = matrix[a ^ (i << 1)][b ^ (j << 1)];
      f2[((a & 1) ^ i)][((b & 1) ^ j)] = matrix[a ^ i][b ^ j];
    }
  }

  // Rescale to unit determinant.
  const sd1 = csqrt(det2c(f1));
  if (sd1[0] * sd1[0] + sd1[1] * sd1[1] > 1e-24) {
    const inv = cinv(sd1);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) f1[i][j] = cmul(f1[i][j], inv);
  }
  const sd2 = csqrt(det2c(f2));
  if (sd2[0] * sd2[0] + sd2[1] * sd2[1] > 1e-24) {
    const inv = cinv(sd2);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) f2[i][j] = cmul(f2[i][j], inv);
  }

  // Global phase from the reference cell.
  const denom = cmul(f1[a >> 1][b >> 1], f2[a & 1][b & 1]);
  let g = cmul(matrix[a][b], cinv(denom));
  if (g[0] < 0) {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) f1[i][j] = neg(f1[i][j]);
    g = neg(g);
  }
  return { g, f1, f2 };
}

/**
 * Cirq's `so4_to_magic_su2s`: given a real SO(4) matrix, find SU(2) A, B
 * with M† (A⊗B) M = mat.
 */
function so4ToMagicSu2s(
  mat: number[][],
  M: Complex[][],
  Mdag: Complex[][],
): { A: Complex[][]; B: Complex[][] } | null {
  const ab = matMul(M, matMul(toComplexMat(mat), Mdag));
  const factored = kronFactor4x4(ab);
  if (!factored) return null;
  return { A: factored.f1, B: factored.f2 };
}

// ─── u3 angle extraction ────────────────────────────────────────────────

function su2ToU3(U: Complex[][]): { theta: number; phi: number; lambda: number } {
  const arg00 = Math.atan2(U[0][0][1], U[0][0][0]);
  const e_negPhase: Complex = [Math.cos(-arg00), Math.sin(-arg00)];
  const Ur: Complex[][] = U.map((row) => row.map((e) => cmul(e_negPhase, e)));
  const cosHalf = Ur[0][0][0];
  const ch = Math.min(1, Math.max(-1, cosHalf));
  const theta = 2 * Math.acos(ch);
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-9) {
    const phiPlusLambda = Math.atan2(Ur[1][1][1], Ur[1][1][0]);
    return { theta, phi: phiPlusLambda, lambda: 0 };
  }
  const phi = Math.atan2(Ur[1][0][1], Ur[1][0][0]);
  const negU01: Complex = neg(Ur[0][1]);
  const lambda = Math.atan2(negU01[1], negU01[0]);
  return { theta, phi, lambda };
}

// ─── Main entry point ──────────────────────────────────────────────────

export function decomposeKAK4x4(U: Complex[][]): KakResult | null {
  if (U.length !== 4 || U[0].length !== 4) return null;

  const M = magicBasis();
  const Mdag = dagger(M);
  const Um = matMul(Mdag, matMul(U, M));

  const { L, d, R } = bidiagonalizeUnitarySpecialOrthogonal(Um);

  // (a1, a0) from Lᵀ, (b1, b0) from Rᵀ.
  const aFactors = so4ToMagicSu2s(transposeReal(L), M, Mdag);
  const bFactors = so4ToMagicSu2s(transposeReal(R), M, Mdag);
  if (!aFactors || !bFactors) return null;
  const a1 = aFactors.A, a0 = aFactors.B;
  const b1 = bFactors.A, b0 = bFactors.B;

  // (w, x, y, z) = KAK_GAMMA · angle(d).
  const phi = d.map((e) => Math.atan2(e[1], e[0]));
  const w = KAK_GAMMA[0][0] * phi[0] + KAK_GAMMA[0][1] * phi[1] + KAK_GAMMA[0][2] * phi[2] + KAK_GAMMA[0][3] * phi[3];
  const x = KAK_GAMMA[1][0] * phi[0] + KAK_GAMMA[1][1] * phi[1] + KAK_GAMMA[1][2] * phi[2] + KAK_GAMMA[1][3] * phi[3];
  const y = KAK_GAMMA[2][0] * phi[0] + KAK_GAMMA[2][1] * phi[1] + KAK_GAMMA[2][2] * phi[2] + KAK_GAMMA[2][3] * phi[3];
  const z = KAK_GAMMA[3][0] * phi[0] + KAK_GAMMA[3][1] * phi[1] + KAK_GAMMA[3][2] * phi[2] + KAK_GAMMA[3][3] * phi[3];
  void w; // absorbed as global phase by the residual check

  const B1 = su2ToU3(b1);
  const B2 = su2ToU3(b0);
  const A1 = su2ToU3(a1);
  const A2 = su2ToU3(a0);

  // U = (a1⊗a0) · exp(i(x·XX + y·YY + z·ZZ)) · (b1⊗b0) (up to global phase).
  // exp(iθ·PP) = RPP(-2θ) in our RPP(θ) = exp(-iθ/2·PP) convention.
  const gates: KakGate[] = [
    { kind: "u3", ...B1, qubit: 0 },
    { kind: "u3", ...B2, qubit: 1 },
    { kind: "rxx", theta: -2 * x },
    { kind: "ryy", theta: -2 * y },
    { kind: "rzz", theta: -2 * z },
    { kind: "u3", ...A1, qubit: 0 },
    { kind: "u3", ...A2, qubit: 1 },
  ];

  const residual = verifyResidual(U, gates);
  if (residual > TOL) {
    if (typeof (globalThis as { __KAK_DEBUG__?: boolean }).__KAK_DEBUG__ !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`KAK: residual = ${residual.toExponential(2)}`);
    }
    return null;
  }
  return { gates, interaction: { alpha: x, beta: y, gamma: z }, residual };
}

// ─── Determinant, verification, gate matrices ───────────────────────────

function det4(A: number[][]): number {
  function det3(m: number[][]): number {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
         - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
         + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  let det = 0;
  for (let j = 0; j < 4; j++) {
    const minor: number[][] = [];
    for (let i = 1; i < 4; i++) {
      const row: number[] = [];
      for (let k = 0; k < 4; k++) if (k !== j) row.push(A[i][k]);
      minor.push(row);
    }
    det += ((j % 2 === 0) ? 1 : -1) * A[0][j] * det3(minor);
  }
  return det;
}

function verifyResidual(U: Complex[][], gates: KakGate[]): number {
  let Mp: Complex[][] = [
    [[1, 0], [0, 0], [0, 0], [0, 0]],
    [[0, 0], [1, 0], [0, 0], [0, 0]],
    [[0, 0], [0, 0], [1, 0], [0, 0]],
    [[0, 0], [0, 0], [0, 0], [1, 0]],
  ];
  for (const g of gates) {
    const G = gateMatrix4x4(g);
    Mp = matMul(G, Mp);
  }
  let pivotI = 0, pivotJ = 0, pivotMag = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const m = U[i][j][0] * U[i][j][0] + U[i][j][1] * U[i][j][1];
    if (m > pivotMag) { pivotMag = m; pivotI = i; pivotJ = j; }
  }
  const u = U[pivotI][pivotJ];
  const m = Mp[pivotI][pivotJ];
  const phaseRatio = cmul(u, cinv(m));
  const phaseMag = Math.hypot(phaseRatio[0], phaseRatio[1]);
  const phase: Complex = phaseMag > 1e-12
    ? [phaseRatio[0] / phaseMag, phaseRatio[1] / phaseMag]
    : [1, 0];
  let maxErr = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const aligned = cmul(phase, Mp[i][j]);
    const dr = aligned[0] - U[i][j][0];
    const di = aligned[1] - U[i][j][1];
    const e = Math.hypot(dr, di);
    if (e > maxErr) maxErr = e;
  }
  return maxErr;
}

function gateMatrix4x4(g: KakGate): Complex[][] {
  if (g.kind === "rxx") {
    const co = Math.cos(g.theta / 2);
    const si = Math.sin(g.theta / 2);
    return [
      [[co, 0], [0, 0], [0, 0], [0, -si]],
      [[0, 0], [co, 0], [0, -si], [0, 0]],
      [[0, 0], [0, -si], [co, 0], [0, 0]],
      [[0, -si], [0, 0], [0, 0], [co, 0]],
    ];
  }
  if (g.kind === "ryy") {
    const co = Math.cos(g.theta / 2);
    const si = Math.sin(g.theta / 2);
    return [
      [[co, 0], [0, 0], [0, 0], [0, si]],
      [[0, 0], [co, 0], [0, -si], [0, 0]],
      [[0, 0], [0, -si], [co, 0], [0, 0]],
      [[0, si], [0, 0], [0, 0], [co, 0]],
    ];
  }
  if (g.kind === "rzz") {
    const em: Complex = [Math.cos(-g.theta / 2), Math.sin(-g.theta / 2)];
    const ep: Complex = [Math.cos(g.theta / 2), Math.sin(g.theta / 2)];
    return [
      [em, [0, 0], [0, 0], [0, 0]],
      [[0, 0], ep, [0, 0], [0, 0]],
      [[0, 0], [0, 0], ep, [0, 0]],
      [[0, 0], [0, 0], [0, 0], em],
    ];
  }
  if (g.kind !== "u3") throw new Error(`unknown KAK gate kind`);
  const u3 = u3Matrix(g.theta, g.phi, g.lambda);
  const I2: Complex[][] = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
  return g.qubit === 0 ? kron(u3, I2) : kron(I2, u3);
}

function u3Matrix(theta: number, phi: number, lambda: number): Complex[][] {
  const ch = Math.cos(theta / 2);
  const sh = Math.sin(theta / 2);
  const eIl: Complex = [Math.cos(lambda), Math.sin(lambda)];
  const eIp: Complex = [Math.cos(phi), Math.sin(phi)];
  const eIpl: Complex = cmul(eIp, eIl);
  return [
    [[ch, 0], [-eIl[0] * sh, -eIl[1] * sh]],
    [[eIp[0] * sh, eIp[1] * sh], [eIpl[0] * ch, eIpl[1] * ch]],
  ];
}

function kron(A: Complex[][], B: Complex[][]): Complex[][] {
  const nA = A.length, mA = A[0].length, nB = B.length, mB = B[0].length;
  const out: Complex[][] = Array.from({ length: nA * nB }, () =>
    Array.from({ length: mA * mB }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < nA; i++)
    for (let j = 0; j < mA; j++)
      for (let k = 0; k < nB; k++)
        for (let l = 0; l < mB; l++)
          out[i * nB + k][j * mB + l] = cmul(A[i][j], B[k][l]);
  return out;
}
