/**
 * Entanglement-spectrum level statistics. Treating the entanglement energies
 * ξ_i = −ln λ_i (eigenvalues λ_i of the reduced density matrix ρ_A across a
 * cut) as a "spectrum," the consecutive-gap ratio
 *
 *   r_i = min(δ_i, δ_{i−1}) / max(δ_i, δ_{i−1}),   δ_i = ξ_{i+1} − ξ_i,
 *
 * distinguishes phases the same way the *energy*-level statistics do, but for
 * the entanglement Hamiltonian: a localized / MBL phase gives Poisson
 * statistics (⟨r⟩ ≈ 0.386), an ergodic / thermal phase gives GOE level
 * repulsion (⟨r⟩ ≈ 0.536). This is a distinct diagnostic from both the
 * energy-spectrum Level-statistics panel and the Schmidt panel. Reuses the
 * entanglement spectrum across the largest available cut.
 */

import { entanglementSpectrum } from "./entanglement";

export type EntSpectrumStatsResult = {
  /** The gap ratios r_i. */
  ratios: number[];
  /** Mean gap ratio ⟨r⟩. */
  meanR: number;
  /** Poisson reference 0.386 / GOE reference 0.536. */
  poisson: number;
  goe: number;
  /** Number of entanglement levels used. */
  levels: number;
};

export function entanglementSpectrumStats(
  state: Float64Array,
  n: number,
  subsetA: number[],
  maxSide = 8,
  cutoff = 1e-12,
): EntSpectrumStatsResult | null {
  const spec = entanglementSpectrum(state, n, subsetA, maxSide);
  if (!spec) return null;
  // Entanglement energies ξ = −ln λ, ascending (drop negligible weights).
  const xi = spec.spectrum.filter((l) => l > cutoff).map((l) => -Math.log(l)).sort((a, b) => a - b);
  if (xi.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < xi.length; i++) gaps.push(xi[i] - xi[i - 1]);
  const ratios: number[] = [];
  for (let i = 1; i < gaps.length; i++) {
    const a = gaps[i - 1], b = gaps[i];
    const mn = Math.min(a, b), mx = Math.max(a, b);
    if (mx > 1e-15) ratios.push(mn / mx);
  }
  const meanR = ratios.length > 0 ? ratios.reduce((x, y) => x + y, 0) / ratios.length : 0;
  return { ratios, meanR, poisson: 0.386, goe: 0.536, levels: xi.length };
}
