/**
 * Quantum error-correction workbench — the repetition code (bit-flip) with a
 * real syndrome-lookup decoder and a Monte-Carlo logical-error-rate sweep.
 *
 * A distance-d repetition code has d data qubits and d−1 parity checks
 * s_i = q_i ⊕ q_{i+1}. Under an i.i.d. bit-flip channel (each qubit flips with
 * probability p) the decoder reads the syndrome, looks up the minimum-weight
 * error consistent with it, applies the correction, and a **logical error**
 * occurs iff the residual is the all-ones (logical X) operator.
 *
 * Sweeping p and comparing distances reproduces the textbook threshold
 * picture: the curves all cross at p = ½ (the repetition-code threshold), and
 * below it a larger distance gives exponentially better protection. The exact
 * rate is the binomial tail Σ_{k>d/2} C(d,k) pᵏ(1−p)^{d−k}; we expose both the
 * closed form (for the smooth curve / verification) and the Monte-Carlo decode
 * (to exercise the actual lookup decoder).
 */

export type QecResult = {
  distances: number[];
  pValues: number[];
  /** logical[i][j] = logical error rate for distances[i] at pValues[j]. */
  logical: number[][];
  /** Crossing point of the two largest-distance curves (≈ 0.5 — the threshold). */
  threshold: number;
  shots: number;
};

const popcount = (x: number): number => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

/** (d−1)-bit syndrome of a d-bit error pattern e. */
function syndromeOf(e: number, d: number): number {
  let s = 0;
  for (let i = 0; i < d - 1; i++) s |= (((e >> i) & 1) ^ ((e >> (i + 1)) & 1)) << i;
  return s;
}

/** Minimum-weight correction per syndrome (size 2^(d−1)). */
export function buildRepDecoder(d: number): Int32Array {
  const table = new Int32Array(1 << (d - 1)).fill(-1);
  const weight = new Int32Array(1 << (d - 1)).fill(d + 1);
  for (let e = 0; e < (1 << d); e++) {
    const s = syndromeOf(e, d);
    const w = popcount(e);
    if (w < weight[s]) { weight[s] = w; table[s] = e; }
  }
  return table;
}

/** Exact logical error rate (min-weight decoder, i.i.d. p): binomial tail. */
export function repetitionExact(d: number, p: number): number {
  // logical error iff residual = all-ones, i.e. > d/2 physical flips.
  let acc = 0;
  const need = Math.floor(d / 2) + 1;
  // binomial coefficient incremental
  let c = 1; // C(d, 0)
  for (let k = 0; k <= d; k++) {
    if (k >= need) acc += c * Math.pow(p, k) * Math.pow(1 - p, d - k);
    c = (c * (d - k)) / (k + 1);
  }
  return acc;
}

/** Monte-Carlo logical error rate using the explicit lookup decoder. */
export function repetitionLogicalErrorRate(d: number, p: number, shots: number, rng: () => number, decoder?: Int32Array): number {
  const table = decoder ?? buildRepDecoder(d);
  const allOnes = (1 << d) - 1;
  let fails = 0;
  for (let s = 0; s < shots; s++) {
    let e = 0;
    for (let q = 0; q < d; q++) if (rng() < p) e |= 1 << q;
    const syn = syndromeOf(e, d);
    const correction = table[syn];
    const residual = e ^ correction;
    if (residual === allOnes) fails++;
  }
  return fails / shots;
}

export type QecOptions = { distances?: number[]; pValues?: number[]; shots?: number; rng?: () => number; exact?: boolean };

export function qecSweep(opts: QecOptions = {}): QecResult {
  const distances = opts.distances ?? [3, 5, 7];
  const pValues = opts.pValues ?? Array.from({ length: 25 }, (_, i) => (i / 24) * 0.6);
  const shots = opts.shots ?? 4000;
  const rng = opts.rng ?? Math.random;
  const exact = opts.exact ?? false;

  const logical: number[][] = distances.map((d) => {
    const decoder = buildRepDecoder(d);
    return pValues.map((p) => (exact ? repetitionExact(d, p) : repetitionLogicalErrorRate(d, p, shots, rng, decoder)));
  });

  // Threshold = where the two largest-distance curves cross. Below it the
  // larger distance has the LOWER error (diff > 0); above it the sign flips.
  // Find the sign change of diff(p) = P_L(dA) − P_L(dB), not min|diff| (both
  // curves → 0 at small p, so |diff| is also tiny there).
  const dA = distances[distances.length - 2] ?? distances[0];
  const dB = distances[distances.length - 1];
  let threshold = 0.5;
  const STEPS = 600;
  let prev = repetitionExact(dA, 0.02) - repetitionExact(dB, 0.02);
  for (let i = 1; i <= STEPS; i++) {
    const p = 0.02 + (i / STEPS) * (0.6 - 0.02);
    const cur = repetitionExact(dA, p) - repetitionExact(dB, p);
    if (prev >= 0 && cur < 0) {
      // linear interpolation of the zero crossing between the two p samples
      const pPrev = 0.02 + ((i - 1) / STEPS) * (0.6 - 0.02);
      threshold = pPrev + (p - pPrev) * (prev / (prev - cur));
      break;
    }
    prev = cur;
  }

  return { distances, pValues, logical, threshold, shots };
}
