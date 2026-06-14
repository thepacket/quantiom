/**
 * Hardware-meaningful fidelity metrics derived from the process (entanglement)
 * fidelity F_pro = |Tr(U_A† U_B)/d|² between two n-qubit unitaries.
 *
 *   • Average gate fidelity (uniform over input states):
 *       F_avg = (d · F_pro + 1) / (d + 1),   d = 2ⁿ.
 *   • Average gate infidelity r = 1 − F_avg — the per-gate error a
 *     randomized-benchmarking experiment would report.
 *   • Diamond-norm distance bound. The diamond distance ε_◇ between the two
 *     channels obeys ε_◇ ≤ 2 √(1 − F_pro) (via the entanglement-fidelity →
 *     trace-distance bound), and ε_◇ ≥ 1 − F_pro; we report both so the
 *     comparison carries a worst-case error budget, not just an average.
 *
 * Pure functions of (F_pro, n) — no simulation. Surfaced in the Equivalence
 * panel, which already computes F_pro from the column comparison.
 */

export type GateFidelityMetrics = {
  avgGateFidelity: number;
  avgGateInfidelity: number;
  /** Lower bound on the diamond-norm distance ε_◇. */
  diamondLower: number;
  /** Upper bound on the diamond-norm distance ε_◇. */
  diamondUpper: number;
};

export function gateFidelityMetrics(processFidelity: number, numQubits: number): GateFidelityMetrics {
  const F = Math.max(0, Math.min(1, processFidelity));
  const d = 2 ** numQubits;
  const avgGateFidelity = (d * F + 1) / (d + 1);
  const avgGateInfidelity = Math.max(0, 1 - avgGateFidelity);
  const diamondLower = Math.max(0, 1 - F);
  const diamondUpper = Math.min(2, 2 * Math.sqrt(Math.max(0, 1 - F)));
  return { avgGateFidelity, avgGateInfidelity, diamondLower, diamondUpper };
}
