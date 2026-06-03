/**
 * Build a circuit's full 2ⁿ × 2ⁿ unitary, column by column. Column j is
 * the simulator's output state for the computational basis input |j⟩
 * (the `startIndex` option of `simulate`) — exactly the construction the
 * equivalence checker uses, surfaced here as raw magnitude + phase for the
 * unitary-heatmap panel.
 *
 * Distinct from the χ-matrix in the Tomography panel (which is the
 * process matrix in the Pauli basis): this is the operator itself, in the
 * computational basis. Reading it shows a permutation's off-diagonal
 * structure, a controlled gate's block form, or QFT's uniform-magnitude
 * phase staircase. Capped tightly — 2ⁿ × 2ⁿ is 4ⁿ complex entries.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type UnitaryResult = {
  dim: number;
  /** Row-major magnitude |U[i,j]| ∈ [0, 1], length dim². */
  mag: Float64Array;
  /** Row-major phase arg(U[i,j]) ∈ (−π, π], length dim². Meaningless where
   *  the corresponding magnitude is ~0. */
  phase: Float64Array;
};

export function buildUnitary(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  maxQubits = 6,
): UnitaryResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  const mag = new Float64Array(dim * dim);
  const phase = new Float64Array(dim * dim);
  for (let j = 0; j < dim; j++) {
    const psi = simulate(circuit, paramValues, customGates, { startIndex: j }).state;
    for (let i = 0; i < dim; i++) {
      const re = psi[2 * i];
      const im = psi[2 * i + 1];
      // Row-major: entry (i, j).
      mag[i * dim + j] = Math.hypot(re, im);
      phase[i * dim + j] = Math.atan2(im, re);
    }
  }
  return { dim, mag, phase };
}
