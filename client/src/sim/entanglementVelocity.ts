/**
 * Entanglement growth velocity — the rate dS/dt at which the half-chain
 * entanglement entropy grows over the `t` clock. After a quench the half-cut
 * entropy S(t) typically rises linearly (the "entanglement tsunami") before
 * saturating; the slope of that ramp is the entanglement velocity v_E, a
 * fundamental rate of the dynamics. Sweeps the clock holding other free
 * symbols fixed, computes S of the [0..⌊n/2⌋−1] cut at each sample, and
 * reports the maximum forward slope. Statevector path; smaller side ≤
 * `maxSide`.
 */

import { simulate, type ParameterValues } from "./simulate";
import { entanglementSpectrum } from "./entanglement";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type EntVelocityResult = {
  ts: number[];
  /** Half-cut entropy S(t) in bits. */
  entropy: number[];
  /** Maximum forward-difference slope dS/dt (the entanglement velocity). */
  velocity: number;
  /** Clock value where the max slope occurs. */
  velocityAt: number;
  /** Maximum entropy reached. */
  maxEntropy: number;
  numQubits: number;
};

export function entanglementVelocity(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 48,
  maxQubits = 12,
  maxSide = 6,
): EntVelocityResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  const half = Math.floor(n / 2);
  const subsetA = Array.from({ length: half }, (_, q) => q);
  if (Math.min(half, n - half) > maxSide) return null;

  const ts = new Array<number>(points);
  const entropy = new Array<number>(points);
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const spec = entanglementSpectrum(res.state, n, subsetA, maxSide);
    entropy[k] = spec ? spec.entropy : NaN;
  }

  let velocity = 0;
  let velocityAt = 0;
  for (let k = 1; k < points; k++) {
    if (!Number.isFinite(entropy[k]) || !Number.isFinite(entropy[k - 1])) continue;
    const slope = (entropy[k] - entropy[k - 1]) / (ts[k] - ts[k - 1]);
    if (slope > velocity) { velocity = slope; velocityAt = ts[k]; }
  }
  const maxEntropy = Math.max(...entropy.filter((x) => Number.isFinite(x)), 0);
  return { ts, entropy, velocity, velocityAt, maxEntropy, numQubits: n };
}
