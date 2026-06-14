/**
 * Stabilizer-Rényi "magic spectrum" — the family of nonstabilizerness
 * measures M_α swept over the Rényi index α, generalising the single M₂ in
 * the Magic panel. With the Pauli distribution Ξ_P = ⟨P⟩² / 2ⁿ (a normalised
 * probability over the 4ⁿ Paulis for a pure state),
 *
 *   M_α = (1 / (1 − α)) · log₂ ( Σ_P Ξ_Pᵅ ) − n,   M₁ = −Σ_P Ξ_P log₂ Ξ_P − n,
 *
 * is ≥ 0 and vanishes **iff** the state is a stabilizer state, for every α.
 * The shape M_α vs α distinguishes states with the same M₂ but different
 * magic structure (e.g. one strong non-Clifford rotation vs many weak ones).
 * Reads the full Pauli spectrum, so callers cap n.
 */

export type MagicSpectrumResult = {
  alphas: number[];
  /** M_α at each α, in "magic bits". */
  m: number[];
  /** M₂ (the headline value), for cross-checking the Magic panel. */
  m2: number;
};

export function magicSpectrum(exp: Float64Array, n: number, alphas?: number[]): MagicSpectrumResult {
  const fourN = 4 ** n;
  const twoN = 1 << n;
  // Ξ_P = ⟨P⟩² / 2ⁿ.
  const xi = new Float64Array(fourN);
  for (let p = 0; p < fourN; p++) xi[p] = (exp[p] * exp[p]) / twoN;

  const grid = alphas ?? [0.5, 1, 1.5, 2, 3, 4];
  const m = grid.map((alpha) => {
    if (Math.abs(alpha - 1) < 1e-9) {
      let s = 0;
      for (let p = 0; p < fourN; p++) if (xi[p] > 1e-15) s -= xi[p] * Math.log2(xi[p]);
      return Math.max(0, s - n);
    }
    let sum = 0;
    for (let p = 0; p < fourN; p++) sum += Math.pow(xi[p], alpha);
    return Math.max(0, (1 / (1 - alpha)) * Math.log2(sum) - n);
  });

  let s4 = 0;
  for (let p = 0; p < fourN; p++) s4 += xi[p] * xi[p];
  const m2 = Math.max(0, -Math.log2(s4) - n);
  return { alphas: grid, m, m2 };
}
