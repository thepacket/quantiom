import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";
import { simulate } from "./simulate";

/**
 * Sample `shots` independent runs of a circuit that contains mid-circuit
 * measurements, returning a histogram of classical-register bitstrings.
 *
 * This is the "dynamic-circuit shots" view — the right way to think about
 * results from a circuit whose measurements affect later gate execution
 * (teleportation, adaptive QEC, etc.). The existing Probabilities panel's
 * shots mode samples from the final amplitudes of one specific trajectory,
 * which is wrong when measurements collapse the state mid-flight.
 *
 * Implementation: call simulate() N times with Math.random as the RNG
 * (overriding the deterministic seed), capture each shot's
 * measurementRecord, increment the count for its bitstring. The work is
 * O(shots × circuit cost) — pure-state runs are sub-millisecond for
 * n ≤ 12, so 8 192 shots finish in well under a second.
 *
 * When the circuit has no measurements, returns an empty map; the caller
 * should fall back to the regular shots histogram.
 */
export function sampleMeasurementShots(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  shots: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const hasMeasurement = circuit.gates.some(
    (g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y",
  );
  if (!hasMeasurement) return counts;
  const numClbits = circuit.numClbits;
  for (let s = 0; s < shots; s++) {
    const r = simulate(circuit, paramValues, customGates, { rng: Math.random });
    const record = r.measurementRecord;
    if (!record) continue;
    // Most-significant clbit on the left — matches the basis labels elsewhere.
    const key = record
      .slice(0, numClbits)
      .map((b) => (b ? "1" : "0"))
      .reverse()
      .join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Trajectory-average |amplitude_i|² across N independent runs.
 *
 * Background: `simulate()` collapses the state at every mid-circuit (or
 * final) measurement. A single-trajectory run therefore reports
 * probabilities pinned to whichever classical branch the deterministic
 * RNG happened to fall into — ~1 on one basis state, 0 elsewhere — which
 * is not what users mean when they read off "probabilities of the final
 * state". The honest distribution is
 *   P(|x⟩) = Σ_classical_outcomes P(outcome) · |⟨x|ψ_outcome⟩|²
 * which this function estimates by running N shots with Math.random as
 * the measurement RNG and averaging the final |amp_i|² across them.
 *
 * For circuits without measurements the answer equals `data.probabilities`
 * exactly (no collapse fires), so callers should still skip this hot path
 * when no measure gate is present — `simulate()` already returns the right
 * thing in one shot.
 *
 * Cost: O(shots × circuit cost × 2^n). 1024 shots on a 10-qubit circuit
 * finishes in well under a second.
 */
export function sampleAveragedAmplitudeProbabilities(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  shots: number,
): number[] {
  const n = circuit.numQubits;
  const dim = 1 << n;
  const acc = new Float64Array(dim);
  if (shots <= 0) return Array.from(acc);
  for (let s = 0; s < shots; s++) {
    const r = simulate(circuit, paramValues, customGates, { rng: Math.random });
    if (r.isStabilizer) {
      // Stabilizer path doesn't expose a full statevector; bail with the
      // single-shot probabilities (caller falls back to the regular path).
      return r.probabilities.slice();
    }
    const state = r.state;
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      acc[i] += re * re + im * im;
    }
  }
  const invN = 1 / shots;
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) out[i] = acc[i] * invN;
  return out;
}
