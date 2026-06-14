/**
 * Coherent information I_c(A⟩B) = S(ρ_B) − S(ρ_AB) for a bipartition of the
 * (mixed) state ρ. It is a lower bound on the one-way distillable entanglement
 * and the quantum-channel capacity: a **positive** coherent information
 * certifies that quantum information survives across the cut, while it goes
 * negative once decoherence has destroyed the quantum correlations. With
 * A ∪ B the whole register, ρ_AB = ρ and I_c = S(ρ_B) − S(ρ). Meaningful only
 * for a mixed state — reads the trajectory-averaged ρ from the noisy
 * simulator. Builds the dense ρ, so capped at a small n.
 */

import type { Complex } from "./density";
import { vonNeumannEntropy } from "./entanglement";

/** Interleaved-re/im flat density matrix → Complex[][]. */
function toMatrix(rho: Float64Array, dim: number): Complex[][] {
  const M: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const o = 2 * (i * dim + j);
      M[i][j] = { re: rho[o], im: rho[o + 1] };
    }
  }
  return M;
}

/** Partial trace of a density matrix over the qubits NOT in `keep`. */
function partialTrace(rho: Complex[][], n: number, keep: number[]): Complex[][] {
  const keptMasks = keep.map((q) => 1 << (n - 1 - q));
  const traced: number[] = [];
  for (let q = 0; q < n; q++) if (!keep.includes(q)) traced.push(q);
  const tracedMasks = traced.map((q) => 1 << (n - 1 - q));
  const k = keep.length;
  const dimK = 1 << k;
  const dimT = 1 << traced.length;
  const out: Complex[][] = Array.from({ length: dimK }, () =>
    Array.from({ length: dimK }, () => ({ re: 0, im: 0 })),
  );
  const idx = (kept: number, tBits: number) => {
    let v = tBits;
    for (let j = 0; j < k; j++) if ((kept >> (k - 1 - j)) & 1) v |= keptMasks[j];
    return v;
  };
  for (let a = 0; a < dimK; a++) {
    for (let b = 0; b < dimK; b++) {
      let re = 0, im = 0;
      for (let t = 0; t < dimT; t++) {
        let tBits = 0;
        for (let j = 0; j < traced.length; j++) if ((t >> (traced.length - 1 - j)) & 1) tBits |= tracedMasks[j];
        const ai = idx(a, tBits), bi = idx(b, tBits);
        re += rho[ai][bi].re;
        im += rho[ai][bi].im;
      }
      out[a][b] = { re, im };
    }
  }
  return out;
}

export type CoherentInfoResult = {
  /** I_c(A⟩B) = S(ρ_B) − S(ρ). */
  coherentInfo: number;
  /** S(ρ_B). */
  sB: number;
  /** S(ρ) of the full state. */
  sFull: number;
};

/**
 * @param rho   interleaved-re/im density matrix (2·dim·dim).
 * @param subsetA  the "A" qubits (sent through / traced for ρ_B); B is the rest.
 */
export function coherentInformation(
  rho: Float64Array,
  n: number,
  subsetA: number[],
  maxQubits = 6,
): CoherentInfoResult | null {
  if (n < 1 || n > maxQubits) return null;
  if (subsetA.length === 0 || subsetA.length >= n) return null;
  const dim = 1 << n;
  const M = toMatrix(rho, dim);
  const inA = new Set(subsetA);
  const B: number[] = [];
  for (let q = 0; q < n; q++) if (!inA.has(q)) B.push(q);
  const sFull = vonNeumannEntropy(M);
  const sB = vonNeumannEntropy(partialTrace(M, n, B));
  return { coherentInfo: sB - sFull, sB, sFull };
}
