/**
 * Noise models for the simulator. Strict opt-in — when `enabled` is false,
 * the fast statevector path in `simulate()` runs untouched.
 *
 * The implementation uses the **quantum trajectories** method (a.k.a.
 * Monte Carlo wave function): each trajectory is one pure-state run of
 * the circuit with stochastic Pauli channels inserted after each gate.
 * Averaging derived quantities across T trajectories converges to the
 * true noisy expectation values. Memory stays at the statevector cap
 * (2 · 2ⁿ doubles) rather than blowing up to 2 · 4ⁿ for a density-matrix
 * sim, so the noise mode reaches n ≈ 16 in practice.
 *
 * Channels implemented:
 *   • single-qubit depolarising (p₁): I with prob 1-p, X/Y/Z each p/3
 *   • two-qubit depolarising  (p₂): I⊗I with prob 1-p, the other 15
 *     non-identity Pauli pairs each p/15
 *   • readout bit-flip (p_r): not active here — measurement is itself
 *     not simulated; the field is reserved for the measurement panel
 *
 * Three-or-more-qubit unitaries (CCX, MCX, etc.) receive 1-qubit
 * depolarising at rate p₂ on every involved qubit. This is the standard
 * "local depolarising" simplification used in Qiskit/Cirq noise models;
 * a calibrated multi-qubit channel would be more accurate but requires
 * per-gate process tomography data that we don't have.
 */

export type NoiseModel = {
  enabled: boolean;
  /** Single-qubit gate depolarising probability. */
  oneQubitDepolarising: number;
  /** Two-qubit gate depolarising probability. */
  twoQubitDepolarising: number;
  /** Readout bit-flip probability. Reserved; not currently applied. */
  readoutBitFlip: number;
  /** Number of trajectories to average. Higher = smoother averages, linear cost. */
  trajectories: number;
};

export const DEFAULT_NOISE: NoiseModel = {
  enabled: false,
  oneQubitDepolarising: 0.001,
  twoQubitDepolarising: 0.01,
  readoutBitFlip: 0.02,
  trajectories: 256,
};

const STORAGE_KEY = "quantiom:noise:v1";

export function loadNoise(): NoiseModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOISE };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOISE,
      ...parsed,
      // clamp to sensible ranges
      oneQubitDepolarising: clamp01(parsed.oneQubitDepolarising ?? DEFAULT_NOISE.oneQubitDepolarising),
      twoQubitDepolarising: clamp01(parsed.twoQubitDepolarising ?? DEFAULT_NOISE.twoQubitDepolarising),
      readoutBitFlip: clamp01(parsed.readoutBitFlip ?? DEFAULT_NOISE.readoutBitFlip),
      trajectories: Math.max(1, Math.min(8192, parsed.trajectories ?? DEFAULT_NOISE.trajectories)),
    };
  } catch {
    return { ...DEFAULT_NOISE };
  }
}

export function saveNoise(n: NoiseModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
  } catch {
    /* ignore quota errors */
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
