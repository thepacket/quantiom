import { describe, test, expect } from "vitest";
import { GATES } from "../src/editor/gates";
import {
  buildMatrix, M_X, M_Y, M_Z, M_H, M_S, M_T, type Matrix,
} from "../src/sim/matrices";
import { isUnitary, matmul, matClose, identity, maxDev } from "./helpers";

// Reasonable non-trivial parameters per gate. u_arb / u_arb_2 get genuinely
// unitary fillings (Hadamard, identity) so the unitarity sweep is meaningful.
const PARAMS: Record<string, number[]> = {
  p: [0.7], rx: [0.7], ry: [1.1], rz: [-0.4], r: [0.7, 1.3],
  gpi: [0.9], gpi2: [0.5], u: [0.7, 1.1, -0.4], u1: [0.7], u2: [0.7, 1.1],
  u3: [0.7, 1.1, -0.4],
  u_arb: [Math.SQRT1_2, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, -Math.SQRT1_2, 0], // Hadamard
  u_arb_2: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], // identity
  crx: [0.7], cry: [1.1], crz: [-0.4], cp: [0.7], cu: [0.7, 1.1, -0.4, 0.3],
  cu1: [0.7], cu3: [0.7, 1.1, -0.4], rxx: [0.7], ryy: [1.1], rzz: [-0.4],
  rzx: [0.9], xx_plus_yy: [0.7, 1.1], xx_minus_yy: [0.7, 1.1], fsim: [0.7, 1.1],
  ms: [0.4, 0.9, 1.3], mcp: [0.7], mcu: [0.7, 1.1, -0.4],
};

describe("buildMatrix — every gate that yields an operator is unitary", () => {
  for (const g of GATES) {
    const nControls = g.variableControls ? 2 : g.numControls;
    const m = buildMatrix(g.id, PARAMS[g.id] ?? [], nControls || undefined);
    if (m === null) continue; // markers, measures, state-prep, control-flow
    test(`${g.id} (${g.name}) is unitary`, () => {
      expect(isUnitary(m, 1e-9), `max dev ${maxDev(matmul(m, transpose(m)), identity(m.length))}`).toBe(true);
    });
  }
});

// conjugate transpose helper local to this file
function transpose(A: Matrix): Matrix {
  const out: [number, number][][] = [];
  for (let j = 0; j < A[0].length; j++) {
    const row: [number, number][] = [];
    for (let i = 0; i < A.length; i++) row.push([A[i][j][0], -A[i][j][1]]);
    out.push(row);
  }
  return out;
}

describe("known gate identities", () => {
  test("X² = Y² = Z² = H² = I", () => {
    for (const M of [M_X, M_Y, M_Z, M_H]) {
      expect(matClose(matmul(M, M), identity(2))).toBe(true);
    }
  });

  test("S² = Z", () => {
    expect(matClose(matmul(M_S, M_S), M_Z)).toBe(true);
  });

  test("T² = S", () => {
    expect(matClose(matmul(M_T, M_T), M_S)).toBe(true);
  });

  test("H·X·H = Z", () => {
    expect(matClose(matmul(matmul(M_H, M_X), M_H), M_Z)).toBe(true);
  });

  test("H·Z·H = X", () => {
    expect(matClose(matmul(matmul(M_H, M_Z), M_H), M_X)).toBe(true);
  });

  test("X·Y = iZ", () => {
    const iZ: Matrix = [[[0, 1], [0, 0]], [[0, 0], [0, -1]]];
    expect(matClose(matmul(M_X, M_Y), iZ)).toBe(true);
  });

  test("CNOT is the canonical big-endian control-0 target-1 matrix", () => {
    const cx = buildMatrix("cx", [])!;
    expect(matClose(cx, [
      [[1, 0], [0, 0], [0, 0], [0, 0]],
      [[0, 0], [1, 0], [0, 0], [0, 0]],
      [[0, 0], [0, 0], [0, 0], [1, 0]],
      [[0, 0], [0, 0], [1, 0], [0, 0]],
    ])).toBe(true);
  });

  test("buildMatrix returns null for non-operator gates", () => {
    for (const id of ["measure", "reset", "barrier", "if", "init0", "initialize"]) {
      expect(buildMatrix(id, [0], 1)).toBeNull();
    }
  });
});
