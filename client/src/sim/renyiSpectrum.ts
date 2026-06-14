/**
 * Rényi entanglement-entropy spectrum across a cut: S_α(ρ_A) as a function of
 * the Rényi index α,
 *
 *   S_α = (1 / (1 − α)) · log₂ ( Σ_i λ_iᵅ ),   S_1 = −Σ λ log₂ λ (von Neumann),
 *
 * where λ_i are the eigenvalues of ρ_A. The shape of S_α vs α reveals the
 * entanglement spectrum's structure: a flat curve means a near-uniform
 * (maximally-mixed, volume-law) spectrum, while a steeply-falling curve means
 * a few dominant Schmidt weights. The α → 0 limit is the log Schmidt rank and
 * α → ∞ is the min-entropy −log₂ λ_max. Reuses the entanglement spectrum;
 * statevector path, smaller side ≤ `maxSide`.
 */

import { entanglementSpectrum } from "./entanglement";

export type RenyiSpectrumResult = {
  alphas: number[];
  /** S_α at each α, in bits. */
  entropies: number[];
  /** Convenience readouts. */
  vonNeumann: number;
  min: number; // S_∞
  hartley: number; // S_0 = log2 rank
};

function renyiAt(spectrum: number[], alpha: number): number {
  const eig = spectrum.filter((x) => x > 1e-12);
  if (eig.length === 0) return 0;
  if (Math.abs(alpha - 1) < 1e-9) {
    let s = 0;
    for (const p of eig) s -= p * Math.log2(p);
    return s;
  }
  if (alpha === 0) return Math.log2(eig.length);
  let sum = 0;
  for (const p of eig) sum += Math.pow(p, alpha);
  return (1 / (1 - alpha)) * Math.log2(sum);
}

export function renyiSpectrum(
  state: Float64Array,
  n: number,
  subsetA: number[],
  alphas?: number[],
  maxSide = 6,
): RenyiSpectrumResult | null {
  const spec = entanglementSpectrum(state, n, subsetA, maxSide);
  if (!spec) return null;
  const grid = alphas ?? [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
  const entropies = grid.map((a) => renyiAt(spec.spectrum, a));
  const lmax = Math.max(...spec.spectrum.filter((x) => x > 1e-12), 1e-12);
  return {
    alphas: grid,
    entropies,
    vonNeumann: renyiAt(spec.spectrum, 1),
    min: -Math.log2(lmax),
    hartley: Math.log2(spec.spectrum.filter((x) => x > 1e-9).length || 1),
  };
}
