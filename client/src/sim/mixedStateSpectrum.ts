/**
 * Mixed-state (channel-output) spectrum — the eigenvalue spectrum of the
 * trajectory-averaged density matrix ρ = (1/T) Σ |ψ_t⟩⟨ψ_t| that the noisy
 * channel produces. The eigenvalues {p_k} are the operational mixture weights
 * of the output: a unitary (noiseless) channel gives a pure output, the
 * spectrum {1, 0, …}; decoherence spreads the weight, and the **effective
 * rank** 1/Σ p_k² counts how many components meaningfully contribute (how far
 * the output is from pure). Reports the spectrum, purity Tr(ρ²), effective
 * rank, and von Neumann entropy S(ρ).
 *
 * Operates on the interleaved-re/im density matrix from `simulateNoisy(…,
 * { density: true })`; the eigen-decomposition uses the real-symmetric
 * embedding, so callers cap n.
 */

import type { Complex } from "./density";
import { densityEigenvalues } from "./entanglement";

export type MixedSpectrumResult = {
  /** Eigenvalues p_k of ρ, sorted descending (sum to 1). */
  spectrum: number[];
  /** Tr(ρ²) ∈ (0, 1]. */
  purity: number;
  /** 1 / Σ p_k² — effective number of contributing eigenstates. */
  effectiveRank: number;
  /** S(ρ) = −Σ p log₂ p, in bits. */
  entropy: number;
};

/** Convert an interleaved-re/im flat density matrix to Complex[][]. */
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

export function densitySpectrum(rho: Float64Array, dim: number): MixedSpectrumResult {
  const eig = densityEigenvalues(toMatrix(rho, dim)).sort((a, b) => b - a);
  let purity = 0;
  let entropy = 0;
  for (const p of eig) {
    purity += p * p;
    if (p > 1e-12) entropy -= p * Math.log2(p);
  }
  const effectiveRank = purity > 1e-15 ? 1 / purity : 0;
  return { spectrum: eig, purity, effectiveRank, entropy };
}
