/**
 * Diagonal ensemble / ETH readout. Given a Pauli-sum Hamiltonian H and the
 * current state |ψ⟩, decompose ψ in H's energy eigenbasis and report the
 * **energy populations** p_k = |⟨E_k|ψ⟩|².
 *
 * These are the weights of the diagonal ensemble ρ_DE = Σ_k p_k |E_k⟩⟨E_k|,
 * the infinite-time average of |ψ(t)⟩⟨ψ(t)| (for a non-degenerate spectrum) —
 * the object the eigenstate-thermalization hypothesis says local observables
 * relax to. Derived quantities:
 *   • mean energy ⟨H⟩ = Σ p_k E_k (conserved under H evolution),
 *   • energy spread ΔE = √(⟨H²⟩ − ⟨H⟩²),
 *   • effective dimension d_eff = 1/Σ p_k² — how many eigenstates ψ spreads
 *     over (large ⇒ the state samples a thermal window; small ⇒ close to an
 *     eigenstate / poor thermalization).
 *
 * Builds H dense and diagonalises via the real-symmetric embedding with
 * eigenvectors (Jacobi). O((2ⁿ)³); capped at small n. p_k per eigenstate is
 * well-defined for a non-degenerate spectrum; the summed weight per energy
 * level is robust regardless.
 */

import { pauliSparse } from "./pauliMatrix";
import type { PauliTerm } from "./trotter";

export type DiagonalEnsembleResult = {
  /** Energies E_k, ascending. */
  energies: number[];
  /** Populations p_k = |⟨E_k|ψ⟩|², aligned with `energies`, Σ = 1. */
  populations: number[];
  /** ⟨H⟩ = Σ p_k E_k. */
  meanEnergy: number;
  /** Energy spread √(⟨H²⟩ − ⟨H⟩²). */
  energySpread: number;
  /** Σ p_k² (inverse participation ratio in the energy basis). */
  ipr: number;
  /** d_eff = 1/Σ p_k². */
  effectiveDim: number;
  numQubits: number;
  dim: number;
};

export const MAX_DIAGENS_QUBITS = 6;

/** Real-symmetric Jacobi with eigenvectors (columns of V). */
function jacobiSym(Ain: number[][]): { values: number[]; vectors: number[][] } {
  const n = Ain.length;
  const A = Ain.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-26) break;
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

export function diagonalEnsemble(
  terms: PauliTerm[],
  state: Float64Array,
  n: number,
  maxQubits = MAX_DIAGENS_QUBITS,
): DiagonalEnsembleResult | null {
  if (n < 1 || n > maxQubits || terms.length === 0) return null;
  const dim = 1 << n;

  // Dense Hermitian H = Σ h_k P_k.
  const Hre: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Him: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      Hre[perm[c]][c] += h * phRe[c];
      Him[perm[c]][c] += h * phIm[c];
    }
  }

  // Real symmetric embedding M = [[Hre, −Him], [Him, Hre]] (2dim × 2dim).
  const D = 2 * dim;
  const M: number[][] = Array.from({ length: D }, () => new Array<number>(D).fill(0));
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      M[i][j] = Hre[i][j]; M[i][j + dim] = -Him[i][j];
      M[i + dim][j] = Him[i][j]; M[i + dim][j + dim] = Hre[i][j];
    }

  const { values, vectors } = jacobiSym(M);
  // Each H eigenvalue appears twice in the embedding; take one of each pair
  // after sorting. The eigenvector [u; w] gives complex |E⟩ = u + i·w.
  const order = Array.from({ length: D }, (_, i) => i).sort((a, b) => values[a] - values[b]);

  const energies: number[] = [];
  const populations: number[] = [];
  for (let t = 0; t < D; t += 2) {
    const col = order[t];
    energies.push(values[col]);
    // ⟨E|ψ⟩ = Σ_i conj(E_i) ψ_i,  E_i = vectors[i][col] + i·vectors[i+dim][col]
    let nrm = 0;
    for (let i = 0; i < dim; i++) {
      const er = vectors[i][col], ei = vectors[i + dim][col];
      nrm += er * er + ei * ei;
    }
    const inv = nrm > 1e-30 ? 1 / Math.sqrt(nrm) : 0;
    let re = 0, im = 0;
    for (let i = 0; i < dim; i++) {
      const er = vectors[i][col] * inv, ei = vectors[i + dim][col] * inv;
      const pr = state[2 * i], pi = state[2 * i + 1];
      // conj(E_i)·ψ_i = (er − i ei)(pr + i pi)
      re += er * pr + ei * pi;
      im += er * pi - ei * pr;
    }
    populations.push(re * re + im * im);
  }

  // Normalise (guards against tiny numerical leakage / non-normalised ψ).
  const total = populations.reduce((s, p) => s + p, 0) || 1;
  for (let k = 0; k < populations.length; k++) populations[k] /= total;

  let meanE = 0, meanE2 = 0, ipr = 0;
  for (let k = 0; k < energies.length; k++) {
    const p = populations[k], e = energies[k];
    meanE += p * e; meanE2 += p * e * e; ipr += p * p;
  }
  const energySpread = Math.sqrt(Math.max(0, meanE2 - meanE * meanE));

  return {
    energies,
    populations,
    meanEnergy: meanE,
    energySpread,
    ipr,
    effectiveDim: ipr > 0 ? 1 / ipr : 0,
    numQubits: n,
    dim,
  };
}
