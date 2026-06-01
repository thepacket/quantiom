/**
 * Sample a discrete distribution N times and tally the outcomes per basis
 * state. Used by the Probabilities panel's "shots" mode to simulate the
 * stochastic measurement behaviour of real quantum hardware.
 */
export function sampleShots(probs: number[], n: number): number[] {
  const dim = probs.length;
  const counts = new Array<number>(dim).fill(0);

  // Build the cumulative distribution in a typed array for fast binary search.
  const cumulative = new Float64Array(dim);
  let total = 0;
  for (let i = 0; i < dim; i++) {
    total += Math.max(0, probs[i]);
    cumulative[i] = total;
  }
  if (total < 1e-12) return counts;
  // Normalize so the last entry is exactly 1 (guards against round-off).
  const norm = 1 / total;
  for (let i = 0; i < dim; i++) cumulative[i] *= norm;

  for (let s = 0; s < n; s++) {
    const u = Math.random();
    let lo = 0;
    let hi = dim - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (u < cumulative[mid]) hi = mid;
      else lo = mid + 1;
    }
    counts[lo]++;
  }
  return counts;
}
