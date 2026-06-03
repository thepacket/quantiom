/**
 * Sweep the `t` clock parameter across one period [0, 2π) and record each
 * qubit's ⟨Z⟩ at every sample. Turns an animated circuit's dynamics into
 * a static set of time-series curves — Rabi/Larmor oscillation, Floquet
 * stroboscopic response, Trotterised evolution — without having to watch
 * the animation play.
 *
 * Other free symbols are held at their current parameter values; only `t`
 * is swept. Cost is `points` simulations.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type TSweepResult = {
  /** Sample points of t, in [0, 2π]. */
  ts: number[];
  /** z[q][k] = ⟨Z_q⟩ at ts[k], in [−1, +1]. */
  z: number[][];
  numQubits: number;
};

export function tSweepZ(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 64,
  maxQubits = 14,
): TSweepResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const ts = new Array<number>(points);
  const z: number[][] = Array.from({ length: n }, () => new Array<number>(points).fill(0));
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const bloch = res.blochVectors;
    for (let q = 0; q < n; q++) z[q][k] = bloch[q]?.z ?? 0;
  }
  return { ts, z, numQubits: n };
}
