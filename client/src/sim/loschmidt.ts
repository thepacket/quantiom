/**
 * Loschmidt echo over the `t` clock: the return probability
 *
 *   L(t) = |⟨ψ(0) | ψ(t)⟩|²
 *
 * of the state to its t = 0 configuration as t sweeps one period [0, 2π).
 * The companion rate function λ(t) = −(1/n) log L(t) develops
 * non-analytic **cusps** at the critical times of a dynamical quantum
 * phase transition (DQPT) — the dynamical analogue of the free-energy
 * kinks of an equilibrium transition.
 *
 * Reuses the t-sweep machinery (one simulation per sample, other free
 * symbols held at their current values); statevector path only.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type LoschmidtResult = {
  ts: number[];
  /** L[k] = |⟨ψ(0)|ψ(ts[k])⟩|² ∈ [0, 1]. */
  L: number[];
  /** rate[k] = −(1/n) ln L[k]; capped for display where L → 0. */
  rate: number[];
  numQubits: number;
};

export function loschmidtEcho(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 64,
  maxQubits = 14,
): LoschmidtResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  const psi0 = simulate(circuit, { ...paramValues, t: 0 }, customGates).state.slice();
  const dim = 1 << n;
  const ts = new Array<number>(points);
  const L = new Array<number>(points);
  const rate = new Array<number>(points);
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const psi = simulate(circuit, { ...paramValues, t }, customGates).state;
    // overlap = Σ_i conj(ψ0_i) · ψ_i
    let re = 0, im = 0;
    for (let i = 0; i < dim; i++) {
      const a0r = psi0[2 * i], a0i = psi0[2 * i + 1];
      const br = psi[2 * i], bi = psi[2 * i + 1];
      re += a0r * br + a0i * bi;
      im += a0r * bi - a0i * br;
    }
    const l = re * re + im * im;
    L[k] = l;
    rate[k] = l > 1e-12 ? -Math.log(l) / n : 30 / n; // cap the diverging tail
  }
  return { ts, L, rate, numQubits: n };
}
