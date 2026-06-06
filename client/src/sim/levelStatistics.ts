/**
 * Level-spacing statistics of a Hamiltonian's eigenvalue spectrum — the
 * energy-domain companion to the spectral form factor.
 *
 * From the sorted spectrum E₀ ≤ E₁ ≤ … take consecutive gaps δₙ = Eₙ₊₁ − Eₙ
 * and the **Oganesyan–Huse gap ratio**
 *
 *     rₙ = min(δₙ, δₙ₋₁) / max(δₙ, δₙ₋₁) ∈ [0, 1].
 *
 * Its mean ⟨r⟩ is the standard many-body-chaos diagnostic and needs **no
 * unfolding** (the ratio is scale-free), unlike the bare spacing distribution
 * P(s). Reference values:
 *   • Poisson (integrable / localised): ⟨r⟩ = 2 ln2 − 1 ≈ 0.3863
 *   • GOE Wigner–Dyson (chaotic):       ⟨r⟩ ≈ 0.5307   (surmise: 0.53590)
 *
 * Degeneracies produce δ = 0 ⇒ r = 0, which drags ⟨r⟩ down; a clean chaos
 * read needs a single symmetry sector. We report the degenerate fraction so
 * the user can see when that caveat bites.
 *
 * Pure function of the eigenvalues — no circuit needed.
 */

export const POISSON_R = 2 * Math.log(2) - 1; // ≈ 0.38629
export const GOE_R = 0.5307; // numerically-observed GOE mean gap ratio

export type LevelStatsResult = {
  /** Consecutive level spacings δₙ = Eₙ₊₁ − Eₙ (D − 1 of them). */
  spacings: number[];
  /** Gap ratios rₙ ∈ [0,1] (D − 2 of them). */
  ratios: number[];
  /** Mean gap ratio ⟨r⟩. */
  meanRatio: number;
  /** Histogram of r over `bins` equal bins on [0,1] (probability density). */
  hist: number[];
  /** Bin count used for `hist`. */
  bins: number;
  /** Fraction of spacings that are (near-)zero — the degeneracy caveat. */
  degenerateFraction: number;
};

export function levelStatistics(energies: number[], bins = 20): LevelStatsResult | null {
  const D = energies.length;
  if (D < 3) return null;

  const sorted = [...energies].sort((a, b) => a - b);
  const span = sorted[D - 1] - sorted[0] || 1;
  const tol = 1e-9 * span + 1e-12;

  const spacings: number[] = [];
  let degenerate = 0;
  for (let i = 0; i < D - 1; i++) {
    const d = sorted[i + 1] - sorted[i];
    spacings.push(d);
    if (d < tol) degenerate++;
  }

  const ratios: number[] = [];
  for (let i = 1; i < spacings.length; i++) {
    const a = spacings[i - 1];
    const b = spacings[i];
    const hi = Math.max(a, b);
    ratios.push(hi < tol ? 0 : Math.min(a, b) / hi);
  }

  const meanRatio = ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0;

  const hist = new Array(bins).fill(0);
  for (const r of ratios) {
    let k = Math.floor(r * bins);
    if (k >= bins) k = bins - 1;
    if (k < 0) k = 0;
    hist[k]++;
  }
  // Normalise to a probability density (∫ = 1 over [0,1]).
  const norm = ratios.length / bins;
  if (norm > 0) for (let k = 0; k < bins; k++) hist[k] /= norm;

  return {
    spacings,
    ratios,
    meanRatio,
    hist,
    bins,
    degenerateFraction: degenerate / spacings.length,
  };
}
