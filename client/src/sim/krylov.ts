/**
 * Krylov / spread complexity of state evolution under a Pauli-sum H.
 *
 * Lanczos on the Krylov space {|ψ⟩, H|ψ⟩, H²|ψ⟩, …} produces the tridiagonal
 * form of H: diagonal Lanczos coefficients aₙ and off-diagonal bₙ. The bₙ
 * sequence is the "operator-growth" profile — for a chaotic system it grows
 * (roughly linearly in n, the maximal-growth hypothesis); for an integrable
 * one it saturates or oscillates.
 *
 * The **spread complexity** C(t) = Σₙ n |⟨Kₙ|ψ(t)⟩|² measures how far the
 * evolving state |ψ(t)⟩ = e^{−iHt}|ψ⟩ has spread along the Krylov chain — it
 * rises, peaks, and settles to a late-time plateau (the chain's "centre of
 * mass"). Computed by diagonalising the small tridiagonal Krylov matrix and
 * evolving the seed vector e₀ in that basis.
 *
 * Dense H matvec, full reorthogonalisation; capped at small n.
 */

import { pauliSparse } from "./pauliMatrix";
import type { PauliTerm } from "./trotter";

export type KrylovResult = {
  /** Lanczos diagonal coefficients aₙ. */
  a: number[];
  /** Lanczos off-diagonal coefficients bₙ (b₁…b_{m−1}). */
  b: number[];
  /** Krylov dimension reached. */
  krylovDim: number;
  /** Sample times. */
  times: number[];
  /** Spread complexity C(t) at each time. */
  complexity: number[];
  /** Late-time / peak complexity for scaling the plot. */
  maxComplexity: number;
  numQubits: number;
};

export const MAX_KRYLOV_QUBITS = 6;

type Vec = { re: Float64Array; im: Float64Array };

function jacobiTridiag(diag: number[], off: number[]): { values: number[]; vectors: number[][] } {
  // Build a dense symmetric matrix (Krylov dim is small) and Jacobi-diagonalise.
  const m = diag.length;
  const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) {
    A[i][i] = diag[i];
    if (i + 1 < m) { A[i][i + 1] = off[i]; A[i + 1][i] = off[i]; }
  }
  const V: number[][] = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let o = 0;
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) o += A[i][j] * A[i][j];
    if (o < 1e-26) break;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
      const apq = A[p][q];
      if (Math.abs(apq) < 1e-300) continue;
      const app = A[p][p], aqq = A[q][q];
      let c: number, s: number;
      if (Math.abs(aqq - app) < 1e-30) { c = Math.SQRT1_2; s = (apq >= 0 ? 1 : -1) * Math.SQRT1_2; }
      else { const th = (aqq - app) / (2 * apq); const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(1 + th * th)); c = 1 / Math.sqrt(1 + t * t); s = t * c; }
      for (let i = 0; i < m; i++) { const aip = A[i][p], aiq = A[i][q]; A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq; }
      for (let j = 0; j < m; j++) { const apj = A[p][j], aqj = A[q][j]; A[p][j] = c * apj - s * aqj; A[q][j] = s * apj + c * aqj; }
      for (let i = 0; i < m; i++) { const vip = V[i][p], viq = V[i][q]; V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq; }
    }
  }
  return { values: Array.from({ length: m }, (_, i) => A[i][i]), vectors: V };
}

export function krylovComplexity(
  terms: PauliTerm[],
  state: Float64Array,
  n: number,
  opts: { samples?: number; maxQubits?: number } = {},
): KrylovResult | null {
  const maxQubits = opts.maxQubits ?? MAX_KRYLOV_QUBITS;
  if (n < 1 || n > maxQubits || terms.length === 0) return null;
  const dim = 1 << n;

  // Dense Hermitian H = Σ h_k P_k.
  const Hre: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Him: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) { Hre[perm[c]][c] += h * phRe[c]; Him[perm[c]][c] += h * phIm[c]; }
  }
  const matvec = (v: Vec): Vec => {
    const re = new Float64Array(dim), im = new Float64Array(dim);
    for (let i = 0; i < dim; i++) {
      let sr = 0, si = 0;
      const hr = Hre[i], hi = Him[i];
      for (let j = 0; j < dim; j++) {
        sr += hr[j] * v.re[j] - hi[j] * v.im[j];
        si += hr[j] * v.im[j] + hi[j] * v.re[j];
      }
      re[i] = sr; im[i] = si;
    }
    return { re, im };
  };
  const dot = (x: Vec, y: Vec): [number, number] => { // ⟨x|y⟩
    let re = 0, im = 0;
    for (let i = 0; i < dim; i++) { re += x.re[i] * y.re[i] + x.im[i] * y.im[i]; im += x.re[i] * y.im[i] - x.im[i] * y.re[i]; }
    return [re, im];
  };

  // Seed K0 = ψ / ‖ψ‖.
  const K: Vec[] = [];
  const k0: Vec = { re: Float64Array.from({ length: dim }, (_, i) => state[2 * i]), im: Float64Array.from({ length: dim }, (_, i) => state[2 * i + 1]) };
  let nrm0 = Math.sqrt(dot(k0, k0)[0]) || 1;
  for (let i = 0; i < dim; i++) { k0.re[i] /= nrm0; k0.im[i] /= nrm0; }
  K.push(k0);

  const a: number[] = [];
  const b: number[] = [];
  let prevB = 0;
  for (let step = 0; step < dim; step++) {
    const w = matvec(K[step]);
    const an = dot(K[step], w)[0]; // real part
    a.push(an);
    // w -= a_n K_n + b_n K_{n-1}
    for (let i = 0; i < dim; i++) {
      w.re[i] -= an * K[step].re[i];
      w.im[i] -= an * K[step].im[i];
      if (step > 0) { w.re[i] -= prevB * K[step - 1].re[i]; w.im[i] -= prevB * K[step - 1].im[i]; }
    }
    // full reorthogonalisation against all previous Krylov vectors
    for (let p = 0; p <= step; p++) {
      const [pr, pi] = dot(K[p], w);
      for (let i = 0; i < dim; i++) {
        w.re[i] -= pr * K[p].re[i] - pi * K[p].im[i];
        w.im[i] -= pr * K[p].im[i] + pi * K[p].re[i];
      }
    }
    const bn = Math.sqrt(Math.max(0, dot(w, w)[0]));
    if (bn < 1e-9) break;
    b.push(bn);
    prevB = bn;
    for (let i = 0; i < dim; i++) { w.re[i] /= bn; w.im[i] /= bn; }
    K.push(w);
  }

  const m = a.length;
  // Time evolution of the seed e0 in the Krylov tridiagonal basis.
  const { values: theta, vectors: V } = jacobiTridiag(a, b);
  const range = (Math.max(...theta) - Math.min(...theta)) || 1;
  const samples = opts.samples ?? 120;
  const tMax = (12 * Math.PI) / range;
  const times: number[] = [];
  const complexity: number[] = [];
  let maxC = 0;
  for (let s = 0; s < samples; s++) {
    const t = (tMax * s) / (samples - 1);
    // φ_n(t) = Σ_k V[n][k] V[0][k] e^{-iθ_k t}
    let C = 0;
    for (let nn = 0; nn < m; nn++) {
      let re = 0, im = 0;
      for (let kk = 0; kk < m; kk++) {
        const w = V[nn][kk] * V[0][kk];
        const ph = -theta[kk] * t;
        re += w * Math.cos(ph);
        im += w * Math.sin(ph);
      }
      C += nn * (re * re + im * im);
    }
    times.push(t);
    complexity.push(C);
    if (C > maxC) maxC = C;
  }

  return { a, b, krylovDim: m, times, complexity, maxComplexity: maxC, numQubits: n };
}
