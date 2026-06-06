/**
 * Quantum coherence in the computational basis — the resource-theory measure
 * of "how much superposition" a state carries off the diagonal.
 *
 *  • **l₁-norm of coherence**  C_l1(ρ) = Σ_{i≠j} |ρ_ij|.
 *    For a pure state ρ_ij = ψ_i ψ_j*, so C_l1 = (Σ_i |ψ_i|)² − Σ_i |ψ_i|².
 *    Maximum (Σ_i 1/√d ⇒) d − 1 for the maximally coherent state.
 *
 *  • **Relative entropy of coherence**  C_rel(ρ) = S(ρ_diag) − S(ρ).
 *    ρ_diag is ρ with the off-diagonal zeroed (the measurement distribution).
 *    For a pure state S(ρ) = 0, so C_rel = H({p_i}) — the Shannon entropy of
 *    the basis probabilities. Maximum log₂ d = n bits.
 *
 * Both vanish on a basis state and are basis-dependent (computational basis).
 * Under decoherence they shrink — the natural "how much superposition
 * survives" readout. We compute the pure-state form from amplitudes and the
 * mixed-state form from a dense ρ; entropies are in bits.
 */

import { vonNeumannEntropy } from "./entanglement";
import type { Complex } from "./density";

export type CoherenceResult = {
  /** l₁-norm of coherence Σ_{i≠j}|ρ_ij|. */
  cL1: number;
  /** Relative entropy of coherence S(ρ_diag) − S(ρ), in bits. */
  cRel: number;
  /** Maximum l₁ coherence d − 1. */
  cL1Max: number;
  /** Maximum relative-entropy coherence log₂ d = n bits. */
  cRelMax: number;
  /** Mixedness penalty S(ρ) in bits (0 for a pure state). */
  stateEntropy: number;
};

const shannonBits = (probs: number[]): number => {
  let s = 0;
  for (const p of probs) if (p > 1e-12) s += p * Math.log2(p);
  return -s;
};

/** Coherence of a pure state from its interleaved-re/im amplitude buffer. */
export function coherenceFromAmplitudes(state: Float64Array, n: number): CoherenceResult {
  const dim = 1 << n;
  let sumAbs = 0;
  let sumAbs2 = 0;
  const probs = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const re = state[2 * i];
    const im = state[2 * i + 1];
    const p = re * re + im * im;
    const a = Math.sqrt(p);
    sumAbs += a;
    sumAbs2 += p; // |ψ_i|² = (|ψ_i|)²
    probs[i] = p;
  }
  // Σ_{i≠j}|ψ_i||ψ_j| = (Σ|ψ_i|)² − Σ|ψ_i|².
  const cL1 = Math.max(0, sumAbs * sumAbs - sumAbs2);
  const cRel = shannonBits(probs);
  return { cL1, cRel, cL1Max: dim - 1, cRelMax: n, stateEntropy: 0 };
}

/** Coherence of a mixed state from a dense ρ (Complex[][], dim×dim). */
export function coherenceFromDensity(rho: Complex[][], n: number): CoherenceResult {
  const dim = 1 << n;
  let cL1 = 0;
  const diag = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if (i === j) {
        diag[i] = rho[i][j].re; // populations are real
      } else {
        const { re, im } = rho[i][j];
        cL1 += Math.hypot(re, im);
      }
    }
  }
  const stateEntropy = vonNeumannEntropy(rho);
  const cRel = Math.max(0, shannonBits(diag) - stateEntropy);
  return { cL1, cRel, cL1Max: dim - 1, cRelMax: n, stateEntropy };
}
