/**
 * Quantum Lyapunov exponent λ_L from the OTOC. In a chaotic system the OTOC
 * grows exponentially at early times, C(t) ∝ e^{λ_L t}, before saturating;
 * λ_L is the rate of that growth (the temporal companion to the spatial
 * butterfly velocity). We take the OTOC over the `t` clock, fit a line to
 * ln C(t) in the early-time growth window (between a small floor and the
 * approach to saturation), and report the slope λ_L. Reuses the OTOC helper.
 */

import { otoc } from "./otoc";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";

export type LyapunovResult = {
  ts: number[];
  C: number[];
  /** ln C over the growth window, aligned with `ts` (NaN outside). */
  lnC: number[];
  /** Fitted Lyapunov exponent λ_L (slope of ln C vs t); NaN if no clean window. */
  lyapunov: number;
  /** Fit intercept (ln C at t=0 of the fitted line). */
  intercept: number;
  numQubits: number;
};

export function lyapunovExponent(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  wQubit = 0,
  vQubit?: number,
  points = 48,
  maxQubits = 6,
): LyapunovResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  const v = vQubit ?? n - 1;
  const r = otoc(circuit, paramValues, customGates, wQubit, v, "Z", "Z", points, maxQubits);
  if (!r) return null;
  const { ts, C } = r;

  const cMax = Math.max(...C);
  const floor = Math.max(1e-3, 0.02 * cMax);
  const ceil = 0.7 * cMax;
  const lnC = C.map((c) => (c > floor && c < ceil ? Math.log(c) : NaN));

  // Linear fit ln C = intercept + λ_L t over the growth window.
  const xs: number[] = [], ys: number[] = [];
  for (let k = 0; k < ts.length; k++) if (Number.isFinite(lnC[k])) { xs.push(ts[k]); ys.push(lnC[k]); }
  let lyapunov = NaN, intercept = NaN;
  if (xs.length >= 2) {
    const N = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < N; k++) { sx += xs[k]; sy += ys[k]; sxx += xs[k] * xs[k]; sxy += xs[k] * ys[k]; }
    const denom = N * sxx - sx * sx;
    if (Math.abs(denom) > 1e-12) {
      lyapunov = (N * sxy - sx * sy) / denom;
      intercept = (sy - lyapunov * sx) / N;
    }
  }
  return { ts, C, lnC, lyapunov, intercept, numQubits: n };
}
