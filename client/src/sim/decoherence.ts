import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulateNoisy } from "./simulateNoisy";
import type { ParameterValues } from "./simulate";
import type { NoiseModel } from "./noise";

export type DecoherenceByDepth = {
  numQubits: number;
  /** Circuit column index for each frame (0 … maxCol). */
  columns: number[];
  /** dists[frame][i] = P(basis state i) after the circuit prefix up through
   *  that column, trajectory-averaged under the noise model. */
  dists: number[][];
  /** True if the circuit had more columns than the cap and was truncated. */
  truncated: boolean;
};

export const MAX_DECOHERENCE_QUBITS = 6;
export const MAX_DECOHERENCE_COLS = 96;

/**
 * Decoherence-by-depth. For each circuit column k, simulate the prefix
 * (columns 0 … k) under the noise model and record the trajectory-averaged
 * measurement distribution. As the depth grows the injected noise accumulates,
 * so the distribution drifts away from its sharp ideal peaks toward the
 * maximally-mixed (uniform) one — the decoherence the Decoherence panel
 * animates frame by frame.
 *
 * Statevector/trajectory path; capped at `maxQubits` qubits (2ⁿ bars) and
 * `MAX_DECOHERENCE_COLS` frames. Returns null when out of range.
 */
export function decoherenceByDepth(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  maxQubits = MAX_DECOHERENCE_QUBITS,
): DecoherenceByDepth | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const lastCol = Math.min(maxCol, MAX_DECOHERENCE_COLS - 1);
  const truncated = maxCol > lastCol;

  const dists: number[][] = [];
  const columns: number[] = [];
  for (let k = 0; k <= lastCol; k++) {
    const prefix: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= k) };
    dists.push(simulateNoisy(prefix, paramValues, customGates, noise).probabilities);
    columns.push(k);
  }
  // Gate-less circuit: still show the (pristine) initial distribution.
  if (dists.length === 0) {
    dists.push(simulateNoisy(circuit, paramValues, customGates, noise).probabilities);
    columns.push(0);
  }
  return { numQubits: n, columns, dists, truncated };
}
