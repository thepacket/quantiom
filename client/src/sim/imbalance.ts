/**
 * Density / charge-density-wave imbalance over the `t` clock — the canonical
 * many-body-localization vs thermalization diagnostic.
 *
 * Starting from a charge-density-wave (Néel) pattern, the staggered
 * magnetisation
 *
 *   I(t) = (1/n) Σ_i (−1)^i ⟨Z_i⟩(t)
 *
 * measures how much of the initial density pattern survives the dynamics. In
 * a thermalising system I(t) → 0 (the pattern washes out); in an MBL phase
 * I(t) saturates to a non-zero plateau (memory of the initial state is
 * retained). Sweeps the `t` clock across one period [0, 2π) holding the other
 * free symbols fixed — the same time proxy the other dynamics panels use.
 *
 * Cost is `points` simulations; reuses the per-qubit ⟨Z⟩ from the Bloch
 * vectors. Statevector path only.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type ImbalanceResult = {
  /** Sample points of t, in [0, 2π]. */
  ts: number[];
  /** Staggered imbalance I(t) ∈ [−1, +1]. */
  imbalance: number[];
  /** Mean |I| over the second half of the window — a crude plateau readout. */
  plateau: number;
  numQubits: number;
};

export function imbalanceSweep(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 64,
  maxQubits = 14,
): ImbalanceResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const ts = new Array<number>(points);
  const imbalance = new Array<number>(points);
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const bloch = res.blochVectors;
    let acc = 0;
    for (let q = 0; q < n; q++) {
      const sign = q % 2 === 0 ? 1 : -1;
      acc += sign * (bloch[q]?.z ?? 0);
    }
    imbalance[k] = acc / n;
  }
  // Plateau: average magnitude over the back half.
  let sum = 0;
  let cnt = 0;
  for (let k = Math.floor(points / 2); k < points; k++) {
    sum += Math.abs(imbalance[k]);
    cnt++;
  }
  const plateau = cnt > 0 ? sum / cnt : 0;
  return { ts, imbalance, plateau, numQubits: n };
}
