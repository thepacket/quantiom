/**
 * Effective temperature from the diagonal ensemble (ETH). After dephasing in
 * the energy eigenbasis, the state's energy populations are p_k = |⟨E_k|ψ⟩|².
 * If the system thermalises, those populations follow a Boltzmann law
 * p_k ∝ e^{−βE_k}, so a linear fit of ln p_k against E_k has slope −β and the
 * effective inverse temperature β (and T = 1/β) reads off the prepared
 * state's place on the thermal scale. A good linear fit (high R²) is direct
 * evidence of eigenstate thermalisation; scatter away from the line signals
 * athermal behaviour. Reuses the diagonal-ensemble populations.
 */

import type { DiagonalEnsembleResult } from "./diagonalEnsemble";

export type EffectiveTempResult = {
  energies: number[];
  /** ln p_k for populations above threshold (aligned with `energies`; NaN below). */
  logPop: number[];
  /** Inverse temperature β (slope = −β of the Boltzmann fit). */
  beta: number;
  /** Temperature 1/β. */
  temperature: number;
  /** Coefficient of determination R² of the linear fit. */
  r2: number;
  /** Fit line ln p = intercept − βE, for drawing. */
  intercept: number;
};

export function effectiveTemperature(diag: DiagonalEnsembleResult, threshold = 1e-9): EffectiveTempResult {
  const { energies, populations } = diag;
  const logPop = populations.map((p) => (p > threshold ? Math.log(p) : NaN));

  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < energies.length; k++) {
    if (Number.isFinite(logPop[k])) { xs.push(energies[k]); ys.push(logPop[k]); }
  }
  let beta = 0;
  let intercept = 0;
  let r2 = 0;
  if (xs.length >= 2) {
    const N = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < N; k++) { sx += xs[k]; sy += ys[k]; sxx += xs[k] * xs[k]; sxy += xs[k] * ys[k]; }
    const denom = N * sxx - sx * sx;
    if (Math.abs(denom) > 1e-12) {
      const slope = (N * sxy - sx * sy) / denom;
      intercept = (sy - slope * sx) / N;
      beta = -slope;
      // R².
      const meanY = sy / N;
      let ssTot = 0, ssRes = 0;
      for (let k = 0; k < N; k++) {
        const fit = intercept + slope * xs[k];
        ssTot += (ys[k] - meanY) ** 2;
        ssRes += (ys[k] - fit) ** 2;
      }
      r2 = ssTot > 1e-12 ? Math.max(0, 1 - ssRes / ssTot) : 1;
    }
  }
  return { energies, logPop, beta, temperature: beta !== 0 ? 1 / beta : Infinity, r2, intercept };
}
