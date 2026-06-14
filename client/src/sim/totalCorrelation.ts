/**
 * Total correlation (multi-information) — the all-parties generalization of
 * mutual information:
 *
 *   C = Σ_i S(ρ_i) − S(ρ).
 *
 * For a pure global state S(ρ) = 0, so C = Σ_i S(ρ_i): the sum of every
 * qubit's individual entanglement with the rest. It captures the *total*
 * correlation distributed across all qubits at once (classical + quantum),
 * complementing the pairwise mutual-information map. A product state gives 0;
 * a GHZ state gives n bits (each qubit maximally mixed). Reuses the per-qubit
 * von Neumann entropies; statevector path.
 */

import { mutualInformationMatrix } from "./entanglement";

export type TotalCorrelationResult = {
  /** Per-qubit S(ρ_i) in bits. */
  perQubit: number[];
  /** Total correlation C = Σ_i S(ρ_i) (pure-state form). */
  total: number;
  numQubits: number;
};

export function totalCorrelation(state: Float64Array, n: number, maxQubits = 14): TotalCorrelationResult | null {
  if (n < 2 || n > maxQubits) return null;
  const mi = mutualInformationMatrix(state, n, maxQubits);
  if (!mi) return null;
  const perQubit = mi.single;
  const total = perQubit.reduce((a, b) => a + b, 0);
  return { perQubit, total, numQubits: n };
}
