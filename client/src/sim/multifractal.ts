/**
 * Multifractal spectrum of the wavefunction in the computational basis. The
 * generalized inverse participation ratios I_q = Σ_x p_xᵍ (p_x = |⟨x|ψ⟩|²)
 * scale as I_q ∼ D^{−τ_q} with the Hilbert-space dimension D = 2ⁿ, and the
 * generalized fractal dimensions are
 *
 *   D_q = τ_q / (q − 1) = −log(Σ p_xᵍ) / ((q − 1) · log D),    D_1 = −Σ p log p / log D.
 *
 * D_q ≈ 1 for all q is a fully delocalised (ergodic) state; D_q ≈ 0 is
 * localised; a non-trivial D_q curve falling with q signals **multifractality**
 * (the critical/intermediate regime). A finer probe than the single IPR in the
 * Participation panel. Reads the probabilities directly.
 */

export type MultifractalResult = {
  qs: number[];
  /** D_q at each q. */
  dq: number[];
  /** D_0 (support dimension), D_1 (information), D_2 (correlation), D_∞ (min). */
  d0: number;
  d1: number;
  d2: number;
  dInf: number;
  numQubits: number;
};

export function multifractal(
  state: Float64Array,
  n: number,
  qs?: number[],
  maxQubits = 16,
): MultifractalResult | null {
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  const logD = Math.log(dim);
  if (logD < 1e-12) return null;

  const p: number[] = [];
  let pMax = 0;
  let support = 0;
  for (let x = 0; x < dim; x++) {
    const re = state[2 * x], im = state[2 * x + 1];
    const pr = re * re + im * im;
    if (pr > 1e-14) { p.push(pr); support++; if (pr > pMax) pMax = pr; }
  }

  const grid = qs ?? [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
  const dq = grid.map((q) => {
    if (Math.abs(q - 1) < 1e-9) {
      let s = 0;
      for (const pr of p) s -= pr * Math.log(pr);
      return s / logD;
    }
    if (q === 0) return Math.log(support) / logD;
    let iq = 0;
    for (const pr of p) iq += Math.pow(pr, q);
    return -Math.log(iq) / ((q - 1) * logD);
  });

  const dAt = (q: number) => {
    if (q === 0) return Math.log(support) / logD;
    let iq = 0;
    for (const pr of p) iq += Math.pow(pr, q);
    return -Math.log(iq) / ((q - 1) * logD);
  };
  let s1 = 0;
  for (const pr of p) s1 -= pr * Math.log(pr);
  return {
    qs: grid,
    dq,
    d0: Math.log(support) / logD,
    d1: s1 / logD,
    d2: dAt(2),
    dInf: -Math.log(pMax) / logD,
    numQubits: n,
  };
}
