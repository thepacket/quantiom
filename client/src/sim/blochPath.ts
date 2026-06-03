/**
 * Per-qubit Bloch-vector trajectory over the `t` clock. Sweeps t across one
 * period [0, 2π) and records the full 3-D Bloch vector of every qubit at
 * each sample, so the panel can draw the *path* each qubit traces on its
 * Bloch sphere — the geometric companion to the t-sweep ⟨Z⟩(t) traces
 * (which show only the z-component).
 *
 * One simulation per sample; statevector path only.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type BlochPathResult = {
  /** path[q] = array of {x,y,z} Bloch vectors over the sweep. */
  path: Array<Array<{ x: number; y: number; z: number }>>;
  numQubits: number;
};

export function blochTrajectories(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 64,
  maxQubits = 12,
): BlochPathResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const path: Array<Array<{ x: number; y: number; z: number }>> = Array.from(
    { length: n },
    () => [],
  );
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    for (let q = 0; q < n; q++) {
      const b = res.blochVectors[q] ?? { x: 0, y: 0, z: 0 };
      path[q].push({ x: b.x, y: b.y, z: b.z });
    }
  }
  return { path, numQubits: n };
}
