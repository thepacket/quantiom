/**
 * Entanglement asymmetry of a subsystem A, swept over circuit depth.
 *
 *   ΔS_A = S(ρ_{A,Q}) − S(ρ_A),   ρ_{A,Q} = Σ_q Π_q ρ_A Π_q,
 *
 * where Π_q projects onto the charge-q sector (here the U(1) excitation
 * number = Hamming weight within A). ΔS_A ≥ 0 measures **how much the
 * subsystem breaks the symmetry** — it's 0 iff ρ_A is block-diagonal in the
 * charge (symmetric), and grows as coherences develop between different-charge
 * sectors. The recently-discovered quantum Mpemba effect lives here: ΔS can
 * rise and then *restore* (fall) non-monotonically as a circuit scrambles.
 *
 * We sweep the circuit column-by-column and plot ΔS_A after each — the
 * symmetry-breaking/restoration dynamics as one curve. A = the first ⌈n/2⌉
 * qubits. One simulation + one |A|-qubit reduced ρ per column.
 */

import { simulate, type ParameterValues } from "./simulate";
import { reducedDensityMatrix, type Complex } from "./density";
import { vonNeumannEntropy } from "./entanglement";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type AsymmetryResult = {
  /** ΔS_A after each column. */
  asymmetry: number[];
  numCols: number;
  /** Number of qubits in subsystem A. */
  subsystemSize: number;
  numQubits: number;
};

export const MAX_ASYM_QUBITS = 12;
const MAX_SUBSYSTEM = 5;
const MAX_COLS = 96;

const popcount = (x: number): number => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

/** ΔS = S(charge-projected ρ_A) − S(ρ_A) for a |A|-qubit reduced state. */
export function asymmetryOf(rhoA: Complex[][]): number {
  const d = rhoA.length;
  const sFull = vonNeumannEntropy(rhoA);
  // Project: zero matrix elements between basis states of different Hamming weight.
  const proj: Complex[][] = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) =>
      popcount(i) === popcount(j) ? rhoA[i][j] : { re: 0, im: 0 },
    ),
  );
  const sProj = vonNeumannEntropy(proj);
  return Math.max(0, sProj - sFull);
}

export function entanglementAsymmetrySweep(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  opts: { maxQubits?: number } = {},
): AsymmetryResult | null {
  const maxQubits = opts.maxQubits ?? MAX_ASYM_QUBITS;
  const n = circuit.numQubits;
  if (n < 2 || n > maxQubits) return null;

  const aSize = Math.min(MAX_SUBSYSTEM, Math.ceil(n / 2));
  const aQubits = Array.from({ length: aSize }, (_, i) => i);

  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const numCols = maxCol + 1;
  if (numCols < 1 || numCols > MAX_COLS) return null;

  const asymmetry: number[] = new Array(numCols).fill(0);
  for (let c = 0; c < numCols; c++) {
    const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
    const res = simulate(sub, paramValues, customGates);
    if (res.isStabilizer) return null;
    const rhoA = reducedDensityMatrix(res.state, n, aQubits);
    asymmetry[c] = asymmetryOf(rhoA);
  }
  return { asymmetry, numCols, subsystemSize: aSize, numQubits: n };
}
