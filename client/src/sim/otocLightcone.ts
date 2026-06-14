/**
 * OTOC light-cone — the out-of-time-order correlator C(t) over the full
 * (qubit, time) plane. Fixing the butterfly operator W on a reference qubit
 * and sweeping the measurement operator V across every qubit and the `t`
 * clock builds a 2-D map C[qubit][t] whose rising wavefront is the operator
 * light-cone (its slope is the butterfly velocity). Where the single-pair
 * OTOC panel shows one time-series and the butterfly-velocity panel reduces it
 * to a number, this shows the whole spreading front at once. Reuses the OTOC
 * helper once per qubit, so it runs on demand at a small qubit cap.
 */

import { otoc } from "./otoc";
import type { Pauli } from "./expectation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";

export type OtocLightconeResult = {
  ts: number[];
  /** C[q][k] = OTOC with V on qubit q at time ts[k]; the W qubit row is ~0. */
  grid: number[][];
  wQubit: number;
  numQubits: number;
  maxC: number;
};

export function otocLightcone(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  wQubit = 0,
  wPauli: Pauli = "Z",
  vPauli: Pauli = "Z",
  points = 28,
  maxQubits = 5,
): OtocLightconeResult | null {
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;
  if (wQubit < 0 || wQubit >= n) return null;

  let ts: number[] = [];
  const grid: number[][] = Array.from({ length: n }, () => []);
  let maxC = 0;
  for (let q = 0; q < n; q++) {
    if (q === wQubit) {
      // Self term: leave as a flat zero row of the right length (filled below).
      grid[q] = [];
      continue;
    }
    const r = otoc(circuit, paramValues, customGates, wQubit, q, wPauli, vPauli, points, maxQubits);
    if (!r) return null;
    ts = r.ts;
    grid[q] = r.C;
    for (const c of r.C) if (c > maxC) maxC = c;
  }
  // Fill the W-qubit self row with zeros of matching length.
  for (let q = 0; q < n; q++) if (grid[q].length === 0) grid[q] = new Array<number>(ts.length).fill(0);
  return { ts, grid, wQubit, numQubits: n, maxC };
}
