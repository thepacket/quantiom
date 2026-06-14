/**
 * Multiparameter quantum Fisher information matrix for collective-spin phase
 * estimation. For a pure state and generators G_a (phases imprinted by
 * e^{−iθ_a G_a}), the QFI matrix is four times the symmetric generator
 * covariance,
 *
 *   F_{ab} = 4 · ( ½⟨{G_a, G_b}⟩ − ⟨G_a⟩⟨G_b⟩ ),
 *
 * with G ∈ {J_x, J_y, J_z}, J_α = ½ Σ_i σ_α. Its eigenvalues are the QFIs of
 * the optimal (rotated) collective generators — the largest eigenvalue is the
 * single-parameter QFI the scalar QFI panel reports for the best axis, and
 * the full matrix bounds the *joint* estimation of several phases (the
 * multiparameter Cramér–Rao bound, det F). A 3×3 heatmap complement to the
 * scalar QFI. Statevector path; cost O(n²·2ⁿ).
 */

import { paulis, type Pauli } from "./expectation";

const AXES = ["X", "Y", "Z"] as const;
type Axis = (typeof AXES)[number];

function single(state: Float64Array, n: number, axis: Axis, q: number): number {
  const arr: Pauli[] = new Array(n).fill("I");
  arr[q] = axis;
  return paulis(state, n, arr);
}
function pair(state: Float64Array, n: number, a: Axis, i: number, b: Axis, j: number): number {
  const arr: Pauli[] = new Array(n).fill("I");
  arr[i] = a;
  arr[j] = b;
  return paulis(state, n, arr);
}

export type MultiQfiResult = {
  /** 3×3 QFI matrix over {Jx, Jy, Jz}. */
  F: number[][];
  /** Eigenvalues ascending. */
  eigenvalues: number[];
  /** Largest eigenvalue (= best single-axis QFI). */
  maxEig: number;
  /** det F (joint-estimability volume). */
  det: number;
};

/** Eigenvalues of a real symmetric 3×3 matrix (analytic). */
function eig3(M: number[][]): number[] {
  const p1 = M[0][1] ** 2 + M[0][2] ** 2 + M[1][2] ** 2;
  const tr = M[0][0] + M[1][1] + M[2][2];
  if (p1 < 1e-18) return [M[0][0], M[1][1], M[2][2]].sort((a, b) => a - b);
  const q = tr / 3;
  const p2 = (M[0][0] - q) ** 2 + (M[1][1] - q) ** 2 + (M[2][2] - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const B = M.map((row, i) => row.map((v, j) => (v - (i === j ? q : 0)) / p));
  const detB =
    B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1]) -
    B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0]) +
    B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]);
  let r = detB / 2;
  r = Math.max(-1, Math.min(1, r));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi);
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  const e2 = 3 * q - e1 - e3;
  return [e3, e2, e1].sort((a, b) => a - b);
}

export function multiparameterQFI(state: Float64Array, n: number, maxQubits = 14): MultiQfiResult | null {
  if (n < 1 || n > maxQubits) return null;
  const m: number[] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += single(state, n, AXES[a], i);
    m[a] = 0.5 * s;
  }
  const F: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let a = 0; a < 3; a++) {
    for (let b = a; b < 3; b++) {
      let acc = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          acc += pair(state, n, AXES[a], i, AXES[b], j);
        }
      }
      let sym = 0.25 * acc;
      if (a === b) sym += 0.25 * n; // same-site symmetric part = δ_ab
      const cov = sym - m[a] * m[b];
      const f = 4 * cov;
      F[a][b] = f;
      F[b][a] = f;
    }
  }
  const eigenvalues = eig3(F);
  const det = F[0][0] * (F[1][1] * F[2][2] - F[1][2] * F[2][1])
    - F[0][1] * (F[1][0] * F[2][2] - F[1][2] * F[2][0])
    + F[0][2] * (F[1][0] * F[2][1] - F[1][1] * F[2][0]);
  return { F, eigenvalues, maxEig: eigenvalues[eigenvalues.length - 1], det };
}
