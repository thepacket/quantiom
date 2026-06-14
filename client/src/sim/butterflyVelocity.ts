/**
 * Butterfly velocity v_B from the OTOC light-cone.
 *
 * Placing the butterfly operator W on a reference qubit and the measurement
 * operator V on each other qubit, the OTOC C(t) at distance r = |q_V − q_W|
 * stays ≈ 0 until the scrambling front arrives, then rises. The **arrival
 * time** t*(r) — when C first crosses a threshold — traces the operator
 * light-cone, and a linear fit r ≈ v_B · t* + c gives the butterfly velocity
 * v_B, the emergent "speed of information" of the circuit dynamics.
 *
 * Reuses `otoc` once per V-qubit (so it is run on demand, not every frame),
 * across the `t` clock. Small qubit cap inherited from the dense-unitary OTOC.
 */

import { otoc } from "./otoc";
import type { Pauli } from "./expectation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";

export type ButterflySeries = {
  /** Distance |q_V − q_W|. */
  distance: number;
  vQubit: number;
  ts: number[];
  C: number[];
  /** Threshold-crossing arrival time t* (null if it never crosses). */
  arrival: number | null;
};

export type ButterflyResult = {
  wQubit: number;
  series: ButterflySeries[];
  /** Fitted butterfly velocity v_B (slope of r vs t*), null if < 2 crossings. */
  vB: number | null;
  /** Fit intercept (sites). */
  intercept: number;
  numQubits: number;
};

function firstCrossing(ts: number[], C: number[], threshold: number): number | null {
  for (let k = 1; k < C.length; k++) {
    if (C[k] >= threshold && C[k - 1] < threshold) {
      // Linear interpolation between samples.
      const frac = (threshold - C[k - 1]) / (C[k] - C[k - 1] || 1);
      return ts[k - 1] + frac * (ts[k] - ts[k - 1]);
    }
  }
  return C[0] >= threshold ? ts[0] : null;
}

export function butterflyVelocity(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  wQubit = 0,
  wPauli: Pauli = "Z",
  vPauli: Pauli = "Z",
  threshold = 0.5,
  points = 32,
  maxQubits = 5,
): ButterflyResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  if (wQubit < 0 || wQubit >= n) return null;

  const series: ButterflySeries[] = [];
  for (let v = 0; v < n; v++) {
    if (v === wQubit) continue;
    const r = otoc(circuit, paramValues, customGates, wQubit, v, wPauli, vPauli, points, maxQubits);
    if (!r) continue;
    series.push({
      distance: Math.abs(v - wQubit),
      vQubit: v,
      ts: r.ts,
      C: r.C,
      arrival: firstCrossing(r.ts, r.C, threshold),
    });
  }
  series.sort((a, b) => a.distance - b.distance);

  // Linear fit distance = vB · t* + intercept over the crossings.
  const pts = series.filter((s) => s.arrival !== null) as Array<ButterflySeries & { arrival: number }>;
  let vB: number | null = null;
  let intercept = 0;
  if (pts.length >= 2) {
    const N = pts.length;
    let st = 0, sd = 0, stt = 0, std = 0;
    for (const p of pts) {
      st += p.arrival;
      sd += p.distance;
      stt += p.arrival * p.arrival;
      std += p.arrival * p.distance;
    }
    const denom = N * stt - st * st;
    if (Math.abs(denom) > 1e-12) {
      vB = (N * std - st * sd) / denom;
      intercept = (sd - vB * st) / N;
    }
  }
  return { wQubit, series, vB, intercept, numQubits: n };
}
