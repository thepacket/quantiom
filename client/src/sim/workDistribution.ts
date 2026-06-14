/**
 * Two-point-measurement (TPM) work distribution for a quench.
 *
 * Protocol: start in |0…0⟩, project onto the eigenbasis of a Hamiltonian H
 * (first energy measurement → outcome E_n with probability p_n = |⟨E_n|0⟩|²),
 * apply the circuit as the quench unitary U, then measure H again. The work
 * done is W = E_m − E_n with probability
 *
 *   P(W) = Σ_{m,n} p_n · |⟨E_m|U|E_n⟩|² · δ(W − (E_m − E_n)),
 *
 * the central object of quantum fluctuation theorems (Jarzynski / Crooks).
 * The histogram's mean is the average work; its spread is the irreversibility
 * of the quench. Requires diagonalising H (with eigenvectors) and the dense
 * circuit unitary, so it runs on demand at a small qubit cap.
 */

import type { Complex } from "./density";
import { pauliSparse } from "./pauliMatrix";
import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { PauliTerm } from "./trotter";

export type WorkDistResult = {
  /** Histogram bin centres (work values). */
  works: number[];
  /** Probability in each bin (sums to 1). */
  probs: number[];
  meanWork: number;
  /** Variance of the work. */
  variance: number;
  binWidth: number;
};

/** Real-symmetric eigensolver (cyclic Jacobi) with eigenvectors as columns. */
function jacobiSym(Ain: number[][]): { values: number[]; vectors: number[][] } {
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

/** Eigen-decomposition of a complex Hermitian matrix via the real-symmetric
 *  embedding [[A,−B],[B,A]]; returns the d eigenvalues + complex eigenvectors. */
function hermitianEig(H: Complex[][]): { values: number[]; vectors: Complex[][] } {
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
  // Sort the 2d embedding eigenpairs ascending and take every other one
  // (each H eigenvalue is doubled).
  const order = Array.from({ length: 2 * d }, (_, i) => i).sort((p, q) => values[p] - values[q]);
  const outVals: number[] = [];
  const outVecs: Complex[][] = [];
  for (let k = 0; k < 2 * d; k += 2) {
    const col = order[k];
    outVals.push(values[col]);
    const v: Complex[] = new Array(d);
    let norm = 0;
    for (let i = 0; i < d; i++) {
      const re = vectors[i][col];
      const im = vectors[i + d][col];
      v[i] = { re, im };
      norm += re * re + im * im;
    }
    const inv = norm > 1e-300 ? 1 / Math.sqrt(norm) : 0;
    for (let i = 0; i < d; i++) { v[i].re *= inv; v[i].im *= inv; }
    outVecs.push(v);
  }
  return { values: outVals, vectors: outVecs };
}

export function workDistribution(
  terms: PauliTerm[],
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  bins = 24,
  maxQubits = 5,
): WorkDistResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits || terms.length === 0) return null;
  const dim = 1 << n;

  // Dense Hermitian H = Σ h_k P_k.
  const H: Complex[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => ({ re: 0, im: 0 })),
  );
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      H[perm[c]][c].re += h * phRe[c];
      H[perm[c]][c].im += h * phIm[c];
    }
  }
  const { values: E, vectors: vecs } = hermitianEig(H);

  // Dense circuit unitary U (columns).
  const Ure: Float64Array[] = [];
  const Uim: Float64Array[] = [];
  for (let j = 0; j < dim; j++) {
    const psi = simulate(circuit, paramValues, customGates, { startIndex: j }).state;
    const cr = new Float64Array(dim), ci = new Float64Array(dim);
    for (let i = 0; i < dim; i++) { cr[i] = psi[2 * i]; ci[i] = psi[2 * i + 1]; }
    Ure.push(cr); Uim.push(ci);
  }

  // p_n = |⟨E_n|0⟩|² = |conj(E_n[0])|² = |E_n[0]|².
  const p = E.map((_, idx) => {
    const c = vecs[idx][0];
    return c.re * c.re + c.im * c.im;
  });

  // Accumulate work values W = E_m − E_n weighted by p_n·|⟨E_m|U|E_n⟩|².
  const pairs: Array<{ w: number; prob: number }> = [];
  for (let nn = 0; nn < dim; nn++) {
    if (p[nn] < 1e-12) continue;
    // V = U|E_n⟩.
    const vRe = new Float64Array(dim), vIm = new Float64Array(dim);
    const en = vecs[nn];
    for (let a = 0; a < dim; a++) {
      let re = 0, im = 0;
      for (let b = 0; b < dim; b++) {
        const ur = Ure[b][a], ui = Uim[b][a]; // U_{ab} stored column b, row a
        const er = en[b].re, ei = en[b].im;
        re += ur * er - ui * ei;
        im += ur * ei + ui * er;
      }
      vRe[a] = re; vIm[a] = im;
    }
    for (let mm = 0; mm < dim; mm++) {
      const em = vecs[mm];
      let re = 0, im = 0;
      for (let a = 0; a < dim; a++) {
        // conj(E_m[a]) · V[a]
        re += em[a].re * vRe[a] + em[a].im * vIm[a];
        im += em[a].re * vIm[a] - em[a].im * vRe[a];
      }
      const t = re * re + im * im;
      if (t < 1e-15) continue;
      pairs.push({ w: E[mm] - E[nn], prob: p[nn] * t });
    }
  }

  let wMin = Infinity, wMax = -Infinity;
  for (const pr of pairs) { if (pr.w < wMin) wMin = pr.w; if (pr.w > wMax) wMax = pr.w; }
  if (!Number.isFinite(wMin)) { wMin = 0; wMax = 0; }
  const span = wMax - wMin;
  const binWidth = span > 1e-12 ? span / bins : 1;
  const probs = new Array<number>(bins).fill(0);
  for (const pr of pairs) {
    let b = span > 1e-12 ? Math.floor((pr.w - wMin) / binWidth) : 0;
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    probs[b] += pr.prob;
  }
  const totalP = probs.reduce((a, b) => a + b, 0) || 1;
  for (let b = 0; b < bins; b++) probs[b] /= totalP;
  const works = Array.from({ length: bins }, (_, b) => wMin + (b + 0.5) * binWidth);
  // Exact moments from the raw (work, prob) pairs — independent of binning, so
  // a single delta peak reports its true value rather than a bin centre.
  let mean = 0;
  for (const pr of pairs) mean += pr.w * (pr.prob / totalP);
  let variance = 0;
  for (const pr of pairs) variance += (pr.w - mean) * (pr.w - mean) * (pr.prob / totalP);
  return { works, probs, meanWork: mean, variance, binWidth };
}
