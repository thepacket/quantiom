/**
 * Anticoncentration / Porter–Thomas test. For a scrambling (Haar-random)
 * circuit the output probabilities p_x = |⟨x|ψ⟩|² follow the Porter–Thomas
 * law: the rescaled variable y = D·p_x (D = 2ⁿ) is exponentially distributed,
 * Pr(y) = e^{−y}. This panel histograms the observed y against that curve —
 * the speckle pattern that underpins random-circuit sampling and linear XEB.
 * The collision-probability ratio
 *
 *   R = D · Σ_x p_x²
 *
 * is the sharp scalar: R = 1 for a flat (uniform) distribution, R = 2 for an
 * anticoncentrated Porter–Thomas distribution, and R ≫ 2 for a peaked state
 * (e.g. a computational-basis state, R = D). Reads the probabilities directly.
 */

export type AnticoncentrationResult = {
  /** Histogram bin centres in y = D·p. */
  centers: number[];
  /** Observed probability density in each bin (integrates to ~1). */
  density: number[];
  /** Porter–Thomas reference e^{−y} at each bin centre. */
  ptCurve: number[];
  /** Collision ratio R = D·Σ p² (1 = flat, 2 = Porter–Thomas). */
  collisionRatio: number;
  numQubits: number;
};

export function anticoncentration(
  state: Float64Array,
  n: number,
  bins = 24,
  yMax = 6,
  maxQubits = 16,
): AnticoncentrationResult | null {
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  const binW = yMax / bins;
  const counts = new Array<number>(bins).fill(0);
  let collision = 0;
  for (let x = 0; x < dim; x++) {
    const re = state[2 * x], im = state[2 * x + 1];
    const p = re * re + im * im;
    collision += p * p;
    const y = dim * p;
    let b = Math.floor(y / binW);
    if (b >= bins) b = bins - 1;
    if (b >= 0) counts[b]++;
  }
  // Normalise the histogram to a probability density over y.
  const density = counts.map((c) => c / dim / binW);
  const centers = Array.from({ length: bins }, (_, b) => (b + 0.5) * binW);
  const ptCurve = centers.map((y) => Math.exp(-y));
  return { centers, density, ptCurve, collisionRatio: dim * collision, numQubits: n };
}
