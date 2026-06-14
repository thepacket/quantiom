/**
 * Correlation length ξ from the connected ⟨ZᵢZⱼ⟩ correlator. Averaging the
 * magnitude of the connected correlator over all pairs at a fixed separation
 * r gives a decay profile g(r); fitting
 *
 *   ln g(r) = −r/ξ + const
 *
 * by least squares yields the correlation length ξ, the characteristic scale
 * over which spins remember each other. ξ stays finite (short-ranged) in a
 * gapped phase and diverges at a critical point. Reuses `zzCorrelations`;
 * statevector path.
 */

import { zzCorrelations } from "./correlations";

export type CorrelationLengthResult = {
  /** Separations r = 1 … n−1. */
  r: number[];
  /** g(r) = mean_{|i−j|=r} |C(i,j)|. */
  g: number[];
  /** Fitted correlation length ξ (Infinity if no decay / too few points). */
  xi: number;
  /** Fit intercept (ln g at r=0). */
  intercept: number;
  /** Number of points that entered the fit. */
  fitPoints: number;
  numQubits: number;
};

export function correlationLength(
  state: Float64Array,
  n: number,
  maxQubits = 16,
): CorrelationLengthResult | null {
  if (n < 3 || n > maxQubits) return null;
  const zz = zzCorrelations(state, n, maxQubits);
  if (!zz) return null;
  const C = zz.conn;

  const r: number[] = [];
  const g: number[] = [];
  for (let d = 1; d < n; d++) {
    let acc = 0;
    let cnt = 0;
    for (let i = 0; i + d < n; i++) {
      acc += Math.abs(C[i][i + d]);
      cnt++;
    }
    r.push(d);
    g.push(cnt > 0 ? acc / cnt : 0);
  }

  // Linear fit ln g = a − r/ξ over separations with appreciable correlation.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < r.length; k++) {
    if (g[k] > 1e-6) { xs.push(r[k]); ys.push(Math.log(g[k])); }
  }
  let xi = Infinity;
  let intercept = ys.length > 0 ? ys[0] : 0;
  if (xs.length >= 2) {
    const N = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < N; k++) { sx += xs[k]; sy += ys[k]; sxx += xs[k] * xs[k]; sxy += xs[k] * ys[k]; }
    const denom = N * sxx - sx * sx;
    if (Math.abs(denom) > 1e-12) {
      const slope = (N * sxy - sx * sy) / denom;
      intercept = (sy - slope * sx) / N;
      xi = slope < -1e-9 ? -1 / slope : Infinity;
    }
  }
  return { r, g, xi, intercept, fitPoints: xs.length, numQubits: n };
}
