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
