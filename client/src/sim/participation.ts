/**
 * Participation / localization metrics in the computational basis, read off
 * the measurement distribution {p_i}.
 *
 *  • **Inverse participation ratio**  IPR = Σ_i p_i².  In [1/D, 1]: 1 when the
 *    state is a single basis state (fully localized), 1/D when uniform
 *    (fully delocalized).
 *  • **Participation ratio**  PR = 1/IPR ∈ [1, D]: the *effective number* of
 *    basis states the weight is spread over.
 *  • **Shannon participation entropy**  S₁ = −Σ p_i ln p_i  (the order-1 Rényi).
 *  • **Rényi-2 participation entropy**  S₂ = −ln IPR.
 *
 * These are the standard Anderson / many-body-localization diagnostics:
 * a localized (insulating) state has O(1) PR independent of size; a
 * delocalized (thermal) state has PR ∝ D. Probabilities are the diagonal of
 * ρ, so this works in noise mode too. O(D).
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type ParticipationResult = {
  ipr: number;
  /** PR = 1/IPR — effective number of occupied basis states. */
  participationRatio: number;
  /** Shannon participation entropy (nats). */
  shannon: number;
  /** Rényi-2 participation entropy = −ln IPR (nats). */
  renyi2: number;
  /** Hilbert-space dimension D = 2ⁿ. */
  dim: number;
  /** PR / D ∈ [1/D, 1]: 0⁺ ⇒ localized, 1 ⇒ uniform. */
  fraction: number;
};

export function participation(probabilities: number[], n: number): ParticipationResult {
  const dim = 1 << n;
  let ipr = 0;
  let shannon = 0;
  for (let i = 0; i < dim && i < probabilities.length; i++) {
    const p = probabilities[i];
    if (p <= 0) continue;
    ipr += p * p;
    shannon -= p * Math.log(p);
  }
  ipr = Math.max(1 / dim, Math.min(1, ipr));
  const participationRatio = 1 / ipr;
  return {
    ipr,
    participationRatio,
    shannon,
    renyi2: -Math.log(ipr),
    dim,
    fraction: participationRatio / dim,
  };
}

export type ParticipationSweepResult = {
  /** Effective participation ratio PR after each column. */
  pr: number[];
  /** Rényi-2 participation entropy (nats) after each column. */
  renyi2: number[];
  numCols: number;
  dim: number;
};

/**
 * Per-column sweep of the participation ratio and Rényi-2 participation
 * entropy — the delocalization "front" as gates spread the weight across the
 * basis. One simulation per column; statevector path, bounded by the caps.
 */
export function participationSweep(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  opts: { maxQubits?: number; maxCols?: number } = {},
): ParticipationSweepResult | null {
  const maxQubits = opts.maxQubits ?? 16;
  const maxCols = opts.maxCols ?? 96;
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const numCols = maxCol + 1;
  if (numCols < 1 || numCols > maxCols) return null;

  const pr: number[] = new Array(numCols).fill(1);
  const renyi2: number[] = new Array(numCols).fill(0);
  for (let c = 0; c < numCols; c++) {
    const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
    const res = simulate(sub, paramValues, customGates);
    const p = participation(res.probabilities, n);
    pr[c] = p.participationRatio;
    renyi2[c] = p.renyi2;
  }
  return { pr, renyi2, numCols, dim: 1 << n };
}
