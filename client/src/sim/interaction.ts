/**
 * Logical interaction graph: how often each pair of qubits is acted on
 * together by a multi-qubit gate. This is the circuit's *logical*
 * connectivity, independent of any hardware coupling map — comparing the
 * two tells you how much routing (SWAP insertion) a device will need.
 *
 * Every gate touching ≥ 2 distinct qubits (all its controls + targets)
 * contributes weight 1 to each unordered pair among those qubits. A bare
 * Bell circuit lights up one edge; a fully-connected ansatz lights up the
 * complete graph; a 1-D Trotter chain lights up only nearest neighbours.
 */

import type { Circuit } from "../editor/types";

export type InteractionResult = {
  /** Symmetric n×n matrix; w[i][j] = number of multi-qubit gates acting on
   *  both i and j. Diagonal is 0. */
  weight: number[][];
  /** Largest single entry, for colour-scale normalisation (≥ 1, or 0 if no
   *  multi-qubit gates). */
  maxWeight: number;
  /** Total number of two-qubit *interactions* counted (sum over the upper
   *  triangle). */
  totalEdges: number;
  numQubits: number;
};

export function interactionGraph(circuit: Circuit): InteractionResult {
  const n = circuit.numQubits;
  const weight: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let maxWeight = 0;
  let totalEdges = 0;
  for (const g of circuit.gates) {
    // Distinct qubits this gate touches (controls + targets).
    const qubits = Array.from(new Set([...g.controls, ...g.targets])).filter(
      (q) => q >= 0 && q < n,
    );
    if (qubits.length < 2) continue;
    for (let a = 0; a < qubits.length; a++) {
      for (let b = a + 1; b < qubits.length; b++) {
        const i = qubits[a], j = qubits[b];
        weight[i][j] += 1;
        weight[j][i] += 1;
        totalEdges += 1;
        if (weight[i][j] > maxWeight) maxWeight = weight[i][j];
      }
    }
  }
  return { weight, maxWeight, totalEdges, numQubits: n };
}
