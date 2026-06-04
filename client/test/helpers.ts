/**
 * Shared helpers for the Quantiom test suite: terse circuit builders and
 * complex-matrix utilities. Kept dependency-free so any test file can
 * import them without pulling in React or the DOM.
 */
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";
import type { Matrix } from "../src/sim/matrices";

let _id = 0;
/** Build a placed gate. Ids are unique per process so equality/optimiser
 *  passes that key on id behave. */
export function gate(
  gateId: string,
  targets: number[],
  controls: number[] = [],
  params: string[] = [],
  column = 0,
): PlacedGate {
  return {
    id: `g${_id++}`,
    gateId: gateId as GateId,
    column,
    controls,
    targets,
    clbits: [],
    params,
  };
}

/** Build a circuit from a gate list. Columns default to placement order so
 *  callers can omit them when sequencing is all that matters. */
export function circ(numQubits: number, gates: PlacedGate[], numClbits = 0): Circuit {
  const placed = gates.map((g, i) => (g.column === 0 ? { ...g, column: i } : g));
  return { numQubits, numClbits, gates: placed };
}

// ── Complex-matrix utilities ────────────────────────────────────────────
// Matrices are arrays of [re, im] tuples (see src/sim/complex.ts).

export function matmul(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const m = B[0].length;
  const inner = B.length;
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const row: [number, number][] = [];
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < inner; k++) {
        const a = A[i][k], b = B[k][j];
        re += a[0] * b[0] - a[1] * b[1];
        im += a[0] * b[1] + a[1] * b[0];
      }
      row.push([re, im]);
    }
    out.push(row);
  }
  return out;
}

export function dagger(A: Matrix): Matrix {
  const n = A.length;
  const m = A[0].length;
  const out: [number, number][][] = [];
  for (let j = 0; j < m; j++) {
    const row: [number, number][] = [];
    for (let i = 0; i < n; i++) row.push([A[i][j][0], -A[i][j][1]]);
    out.push(row);
  }
  return out;
}

export function identity(n: number): Matrix {
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const row: [number, number][] = [];
    for (let j = 0; j < n; j++) row.push([i === j ? 1 : 0, 0]);
    out.push(row);
  }
  return out;
}

export function matClose(A: Matrix, B: Matrix, eps = 1e-9): boolean {
  if (A.length !== B.length || A[0].length !== B[0].length) return false;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++)
      if (Math.abs(A[i][j][0] - B[i][j][0]) > eps || Math.abs(A[i][j][1] - B[i][j][1]) > eps) return false;
  return true;
}

/** True iff A is unitary: A·A† = I. */
export function isUnitary(A: Matrix, eps = 1e-9): boolean {
  return matClose(matmul(A, dagger(A)), identity(A.length), eps);
}

/** Max absolute element-wise deviation between two equal-shape matrices. */
export function maxDev(A: Matrix, B: Matrix): number {
  let d = 0;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++)
      d = Math.max(d, Math.abs(A[i][j][0] - B[i][j][0]), Math.abs(A[i][j][1] - B[i][j][1]));
  return d;
}
