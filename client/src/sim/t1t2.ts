/**
 * T1 / T2 characterization experiments, with the idle delay measured in gate
 * times (each idle is one identity gate, so the noise model's per-gate damping
 * accumulates).
 *
 *  • T1 (inversion recovery): prepare |1⟩, idle for k gates, read P(|1⟩). Under
 *    amplitude damping γ_AD per gate this decays as (1−γ_AD)^k ≈ e^{−k/T1},
 *    giving T1 = −1/ln(1−γ_AD) gate-times.
 *  • T2* (Ramsey): prepare |+⟩, idle k gates, rotate back with H, read P(|0⟩).
 *    The coherence decays under both amplitude and phase damping, so P(0) =
 *    (1 + c^k)/2 with c = √((1−γ_AD)(1−γ_PD)) (depolarising contributes too),
 *    giving T2 = −1/ln c. Physically T2 ≤ 2·T1.
 *
 * Both curves are produced by the trajectory simulator (so depolarising and any
 * custom Kraus channel are included) and the decay constants come from a log-
 * linear fit. Needs amplitude/phase damping set in the Noise panel to decay.
 */

import type { Circuit, PlacedGate } from "../editor/types";
import { simulateNoisy } from "./simulateNoisy";
import type { NoiseModel } from "./noise";

export type T1T2Result = {
  delays: number[];
  /** P(|1⟩) after the T1 idle. */
  t1Curve: number[];
  /** P(|0⟩) after the T2 (Ramsey) idle. */
  t2Curve: number[];
  /** Decay constants in gate-times (Infinity ⇒ no measurable decay). */
  T1: number;
  T2: number;
  trajectories: number;
};

let _tid = 0;
function g(gateId: string, col: number): PlacedGate {
  return { id: `t12_${_tid++}`, gateId: gateId as PlacedGate["gateId"], column: col, controls: [], targets: [0], clbits: [], params: [] };
}

function idleChain(prep: string[], delay: number, post: string[]): Circuit {
  const gates: PlacedGate[] = [];
  let col = 0;
  for (const id of prep) gates.push(g(id, col++));
  for (let k = 0; k < delay; k++) gates.push(g("i", col++));
  for (const id of post) gates.push(g(id, col++));
  if (gates.length === 0) gates.push(g("i", col++));
  return { numQubits: 1, numClbits: 0, gates };
}

/** Log-linear fit of y = A·e^{−t/τ} ⇒ returns τ in the same units as t. */
function fitTau(ts: number[], ys: number[]): number {
  const xs: number[] = [], ls: number[] = [];
  for (let i = 0; i < ts.length; i++) if (ys[i] > 1e-3) { xs.push(ts[i]); ls.push(Math.log(ys[i])); }
  if (xs.length < 2) return Infinity;
  const np = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ls.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ls[i], 0);
  const slope = (np * sxy - sx * sy) / (np * sxx - sx * sx || 1);
  return slope < 0 ? -1 / slope : Infinity;
}

export type T1T2Options = { delays?: number[]; rng?: () => number };

export function t1t2(noise: NoiseModel, opts: T1T2Options = {}): T1T2Result {
  const delays = opts.delays ?? [0, 4, 8, 16, 24, 32, 48, 64, 96, 128];

  const t1Curve = delays.map((d) => simulateNoisy(idleChain(["x"], d, []), {}, [], noise).probabilities[1]);
  const t2Curve = delays.map((d) => simulateNoisy(idleChain(["h"], d, ["h"]), {}, [], noise).probabilities[0]);

  const T1 = fitTau(delays, t1Curve);
  // Ramsey amplitude above the ½ floor.
  const T2 = fitTau(delays, t2Curve.map((p) => p - 0.5));
  return { delays, t1Curve, t2Curve, T1, T2, trajectories: noise.trajectories };
}
