/**
 * Space–time magnetisation map: per-qubit ⟨Z⟩ at every circuit column.
 *
 * Re-simulates the circuit truncated after each column and records each
 * qubit's ⟨Z_q⟩ (= the z-component of its Bloch vector). The result is a
 * qubits × columns grid — the standard "space–time diagram" of many-body
 * dynamics, where a light-cone / entanglement front or a Floquet
 * period-doubling stripe pattern is visible at a glance.
 *
 * Cost: one full simulation per column (O(columns) sims). Bounded by the
 * caps below and only run on demand, so it stays off the default-fast hot
 * path.
 */

import { simulate, type ParameterValues } from "./simulate";
import { reducedDensityMatrix } from "./density";
import { vonNeumannEntropy } from "./entanglement";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type SpaceTimeResult = {
  /** z[q][c] = ⟨Z_q⟩ after column c, in [−1, +1]. */
  z: number[][];
  numCols: number;
  numQubits: number;
};

export function spaceTimeZ(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  opts: { maxQubits?: number; maxCols?: number } = {},
): SpaceTimeResult | null {
  const maxQubits = opts.maxQubits ?? 14;
  const maxCols = opts.maxCols ?? 80;
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const numCols = maxCol + 1;
  if (numCols < 1 || numCols > maxCols) return null;

  const z: number[][] = Array.from({ length: n }, () => new Array<number>(numCols).fill(0));
  for (let c = 0; c < numCols; c++) {
    const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
    const res = simulate(sub, paramValues, customGates);
    const bloch = res.blochVectors;
    for (let q = 0; q < n; q++) z[q][c] = bloch[q]?.z ?? 0;
  }
  return { z, numCols, numQubits: n };
}

export type SpaceTimeEntropyResult = {
  /** s[q][c] = single-qubit von Neumann entropy S(ρ_q) after column c, in
   *  bits ∈ [0, 1]. 0 = qubit pure (disentangled); 1 = maximally mixed
   *  (maximally entangled with the rest). */
  s: number[][];
  numCols: number;
  numQubits: number;
};

/**
 * Space–time entanglement map: the single-qubit entanglement entropy
 * S(ρ_q) of every qubit after every column. Companion to `spaceTimeZ` —
 * where that shows the local magnetisation ⟨Z_q⟩, this shows how entangled
 * each qubit has become with the rest of the register, so the
 * entanglement-growth front is visible directly: a light cone of rising
 * entropy spreading out from where two-qubit gates first act.
 *
 * Cost: one full simulation per column, plus one 2×2 reduced density
 * matrix per (qubit, column). Statevector path only; bounded by the caps.
 */
export function spaceTimeEntropy(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  opts: { maxQubits?: number; maxCols?: number } = {},
): SpaceTimeEntropyResult | null {
  const maxQubits = opts.maxQubits ?? 12;
  const maxCols = opts.maxCols ?? 80;
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const numCols = maxCol + 1;
  if (numCols < 1 || numCols > maxCols) return null;

  const s: number[][] = Array.from({ length: n }, () => new Array<number>(numCols).fill(0));
  for (let c = 0; c < numCols; c++) {
    const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
    const res = simulate(sub, paramValues, customGates);
    for (let q = 0; q < n; q++) {
      s[q][c] = vonNeumannEntropy(reducedDensityMatrix(res.state, n, [q]));
    }
  }
  return { s, numCols, numQubits: n };
}
