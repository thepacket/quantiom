/**
 * Negativity dynamics — the logarithmic negativity across a fixed bipartition
 * swept over the `t` clock. For a pure global state the log-negativity across
 * a cut has a cheap closed form in terms of the Schmidt coefficients √λ_i
 * (eigenvalues λ_i of the reduced density matrix ρ_A):
 *
 *   E_N = log₂ ‖ρ^{T_A}‖₁ = 2 · log₂ ( Σ_i √λ_i ),
 *
 * so we read it straight off the entanglement spectrum at each clock value —
 * no full 2ⁿ×2ⁿ partial transpose needed. The curve shows entanglement
 * growth, oscillation, and "sudden death/revival" over one period. Reuses the
 * entanglement spectrum; statevector path, smaller cut side ≤ `maxSide`.
 */

import { simulate, type ParameterValues } from "./simulate";
import { entanglementSpectrum } from "./entanglement";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type NegativityDynamicsResult = {
  ts: number[];
  /** Log-negativity E_N(t) across the chosen cut. */
  logNeg: number[];
  maxLogNeg: number;
  numQubits: number;
};

export function negativityDynamics(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  subsetA: number[],
  points = 64,
  maxQubits = 12,
  maxSide = 6,
): NegativityDynamicsResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  if (subsetA.length === 0 || subsetA.length >= n) return null;
  if (Math.min(subsetA.length, n - subsetA.length) > maxSide) return null;

  const ts = new Array<number>(points);
  const logNeg = new Array<number>(points);
  let maxLogNeg = 0;
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const spec = entanglementSpectrum(res.state, n, subsetA, maxSide);
    if (!spec) { logNeg[k] = NaN; continue; }
    let sumSqrt = 0;
    for (const lambda of spec.spectrum) if (lambda > 1e-12) sumSqrt += Math.sqrt(lambda);
    const en = 2 * Math.log2(sumSqrt > 0 ? sumSqrt : 1);
    logNeg[k] = en;
    if (en > maxLogNeg) maxLogNeg = en;
  }
  return { ts, logNeg, maxLogNeg, numQubits: n };
}
