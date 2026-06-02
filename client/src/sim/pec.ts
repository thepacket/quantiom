import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { expandCustomGates } from "../editor/customGates";
import { evaluateObservable, type Observable } from "./expectation";
import { applyKQubit } from "./apply";
import { buildMatrix, M_X, M_Y, M_Z, type Matrix } from "./matrices";
import type { NoiseModel } from "./noise";

/**
 * Probabilistic Error Cancellation for single-qubit depolarising noise.
 *
 * The depolarising channel with rate p ∈ [0, 3/4) is the Pauli channel
 *   N(ρ) = (1−p)ρ + (p/3)(XρX + YρY + ZρZ)
 *
 * Its inverse is another linear combination (a quasiprobability map) with
 *   γ_I = (1 + 3q)/4,    γ_{X,Y,Z} = (1 − q)/4
 * where q = 1 / (1 − 4p/3). γ_I is positive, γ_{X,Y,Z} are negative.
 * Sample weight: γ_total = γ_I + 3|γ_{X,Y,Z}| = (3q − 1)/2.
 *
 * Estimator: for each trajectory simulate the *noiseless* circuit, sample a
 * Pauli correction after every one-qubit gate from probabilities
 *   p_a = |γ_a| / γ_total,
 * apply it, and accumulate sign(γ_a) · γ_total per location. The unbiased
 * estimator is
 *   ⟨O⟩_PEC = (1/T) Σ_t (Π_loc sign_t,loc · γ_total) · ⟨O⟩_t
 * which converges to the noise-free expectation as T → ∞. Variance grows
 * exponentially in circuit depth (γ_total^{2 d}); PEC is meant for short
 * circuits where ZNE alone isn't expressive enough.
 *
 * Scope: single-qubit depolarising only. Damping, two-qubit depolarising,
 * crosstalk, readout, custom Kraus are not inverted here.
 */

export type PecResult = {
  /** PEC-cancelled estimate of ⟨observable⟩. */
  value: number;
  /** Number of trajectories run. */
  trajectories: number;
  /** Variance overhead factor γ_total^{2 · numLocations}. Diverges as p
   *  approaches 3/4; included so the UI can warn users about high-cost regimes. */
  varianceOverhead: number;
  /** Number of one-qubit-gate insertion locations seen in the circuit. */
  locations: number;
};

export function pecExpectation(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  observable: Observable,
  trajectories: number,
): PecResult {
  const p = clamp(noise.oneQubitDepolarising, 0, 0.749);
  const q = 1 / (1 - (4 * p) / 3);
  const gammaI = (1 + 3 * q) / 4;
  const gammaP = (1 - q) / 4; // negative for p > 0
  const absI = Math.abs(gammaI);
  const absP = Math.abs(gammaP);
  const gammaTotal = absI + 3 * absP;
  const pI = absI / gammaTotal;
  const pX = absP / gammaTotal;
  const pY = absP / gammaTotal;
  // (pZ = 1 - pI - pX - pY, implicit)

  const n = circuit.numQubits;
  if (n === 0) return { value: 0, trajectories, varianceOverhead: 1, locations: 0 };

  // Expand custom gates and sort columns ahead of the trajectory loop so the
  // hot path doesn't redo it per trajectory.
  const expanded = expandCustomGates(circuit.gates, customGates);
  const sorted = [...expanded].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );

  // Count 1-qubit gate locations once so we can report the variance overhead
  // up front, even before running the loop.
  let oneQGateCount = 0;
  for (const g of sorted) {
    const isOneQ =
      g.controls.length === 0 && g.targets.length === 1 &&
      g.gateId !== "measure" && g.gateId !== "measure_x" && g.gateId !== "measure_y" &&
      g.gateId !== "reset" && g.gateId !== "barrier" && g.gateId !== "delay" &&
      !g.gateId.startsWith("init") &&
      g.gateId !== "if" && g.gateId !== "while" && g.gateId !== "switch" && g.gateId !== "box";
    if (isOneQ) oneQGateCount++;
  }
  const varianceOverhead = Math.pow(gammaTotal, 2 * oneQGateCount);

  // Pre-build matrices for the trajectory hot path.
  type Step =
    | { kind: "1q"; U: Matrix; q: number }
    | { kind: "multi"; U: Matrix; qubits: number[]; antiQubits: number[] }
    | { kind: "skip" };
  const steps: Step[] = sorted.map((g) => {
    if (g.gateId === "barrier" || g.gateId === "delay" || g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") {
      return { kind: "skip" };
    }
    if (g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y" || g.gateId === "reset" || g.gateId.startsWith("init")) {
      return { kind: "skip" };
    }
    const params = g.params.map((expr) => parseFloat(expr));
    const U = buildMatrix(g.gateId, params, g.controls.length);
    if (!U) return { kind: "skip" };
    const qubits = [...g.controls, ...g.targets];
    if (qubits.length === 1) return { kind: "1q", U, q: qubits[0] };
    const antiQubits: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antiQubits.push(g.controls[i]);
      }
    }
    return { kind: "multi", U, qubits, antiQubits };
  });
  void paramValues;

  // For each trajectory, simulate ideally + insert sampled Pauli corrections
  // after each 1q gate. Sum a sign- and γ_total-weighted observable.
  const dim = 1 << n;
  let sum = 0;
  for (let t = 0; t < trajectories; t++) {
    const state = new Float64Array(2 * dim);
    state[0] = 1;
    let weight = 1; // accumulates Π sign · γ_total per location
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind === "skip") continue;
      if (s.kind === "multi") {
        for (const aq of s.antiQubits) applyKQubit(state, n, [aq], M_X);
        applyKQubit(state, n, s.qubits, s.U);
        for (const aq of s.antiQubits) applyKQubit(state, n, [aq], M_X);
        continue;
      }
      // s.kind === "1q": apply the gate, then sample a Pauli correction.
      applyKQubit(state, n, [s.q], s.U);
      const r = Math.random();
      let chosen: 0 | 1 | 2 | 3;
      if (r < pI) chosen = 0;
      else if (r < pI + pX) chosen = 1;
      else if (r < pI + pX + pY) chosen = 2;
      else chosen = 3;
      // Apply the chosen Pauli (I = no-op).
      if (chosen === 1) applyKQubit(state, n, [s.q], M_X);
      else if (chosen === 2) applyKQubit(state, n, [s.q], M_Y);
      else if (chosen === 3) applyKQubit(state, n, [s.q], M_Z);
      const sign = chosen === 0 ? Math.sign(gammaI) : Math.sign(gammaP);
      weight *= sign * gammaTotal;
    }
    sum += weight * evaluateObservable(state, n, observable);
  }
  return {
    value: sum / trajectories,
    trajectories,
    varianceOverhead,
    locations: oneQGateCount,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Re-exports to keep the module self-contained when imported from panels.
export { simulate };
