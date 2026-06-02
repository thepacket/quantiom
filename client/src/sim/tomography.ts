import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";
import { simulate } from "./simulate";

/**
 * Process tomography for small-n circuits.
 *
 * Strategy:
 *   1. Build the full 2ⁿ × 2ⁿ unitary U by simulating with each
 *      computational-basis input (column-by-column).
 *   2. Decompose U into the n-qubit Pauli basis: U = Σ_P β_P · P,
 *      where β_P = Tr(P† U) / 2ⁿ.
 *   3. χ_{mn} = β_m · β̄_n. For a unitary process, χ is rank-1; for a
 *      noisy process it would be rank > 1 but Quantiom's tomography
 *      always sees a unitary (we don't simulate the process with noise
 *      enabled — that's a follow-up).
 *
 * Capped at 4 qubits (χ is 256×256 = 65k complex entries); typical use
 * is n ≤ 2.
 */

export const MAX_TOMOGRAPHY_QUBITS = 4;

export type Complex = { re: number; im: number };

export type ProcessResult = {
  n: number;
  /** Pauli labels in big-endian order: e.g. for n=2, ["II","IX","IY","IZ","XI","XX",...,"ZZ"]. */
  labels: string[];
  /** Pauli decomposition coefficients β_P (length 4ⁿ). */
  beta: Complex[];
  /** Process matrix χ in the Pauli basis (4ⁿ × 4ⁿ). */
  chi: Complex[][];
  /** Process fidelity to the closest known named gate (rough — for visual
   *  sanity-checking only). null when nothing matches well. */
  closestMatch?: { name: string; fidelity: number };
};

// Pauli matrices.
const I_MAT: Complex[][] = [[{re:1,im:0},{re:0,im:0}],[{re:0,im:0},{re:1,im:0}]];
const X_MAT: Complex[][] = [[{re:0,im:0},{re:1,im:0}],[{re:1,im:0},{re:0,im:0}]];
const Y_MAT: Complex[][] = [[{re:0,im:0},{re:0,im:-1}],[{re:0,im:1},{re:0,im:0}]];
const Z_MAT: Complex[][] = [[{re:1,im:0},{re:0,im:0}],[{re:0,im:0},{re:-1,im:0}]];
const PAULIS: Complex[][][] = [I_MAT, X_MAT, Y_MAT, Z_MAT];
const PAULI_LETTER = ["I", "X", "Y", "Z"];

function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cadd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}
function cconj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

/** Kronecker product of two complex matrices. */
function kron(A: Complex[][], B: Complex[][]): Complex[][] {
  const aR = A.length, aC = A[0].length;
  const bR = B.length, bC = B[0].length;
  const out: Complex[][] = Array.from({ length: aR * bR }, () =>
    new Array<Complex>(aC * bC).fill({ re: 0, im: 0 } as Complex),
  );
  for (let i = 0; i < aR; i++) {
    for (let j = 0; j < aC; j++) {
      for (let k = 0; k < bR; k++) {
        for (let l = 0; l < bC; l++) {
          out[i * bR + k][j * bC + l] = cmul(A[i][j], B[k][l]);
        }
      }
    }
  }
  return out;
}

/** Build the n-qubit Pauli from a base-4 index (big-endian: q0 most significant). */
function pauliFromIndex(n: number, idx: number): { mat: Complex[][]; label: string } {
  let mat: Complex[][] = [[{ re: 1, im: 0 }]];
  const letters: string[] = [];
  for (let q = 0; q < n; q++) {
    const shift = (n - 1 - q) * 2;
    const which = (idx >> shift) & 0x3;
    letters.push(PAULI_LETTER[which]);
    mat = q === 0 ? PAULIS[which] : kron(mat, PAULIS[which]);
  }
  return { mat, label: letters.join("") };
}

export function processTomography(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
): ProcessResult {
  const n = circuit.numQubits;
  if (n > MAX_TOMOGRAPHY_QUBITS) {
    throw new Error(`process tomography capped at ${MAX_TOMOGRAPHY_QUBITS} qubits (got ${n})`);
  }
  const dim = 1 << n;

  // Build U as a 2ⁿ × 2ⁿ matrix.
  const U: Complex[][] = Array.from({ length: dim }, () =>
    new Array<Complex>(dim).fill({ re: 0, im: 0 } as Complex),
  );
  for (let j = 0; j < dim; j++) {
    const r = simulate(circuit, paramValues, customGates, { startIndex: j });
    for (let i = 0; i < dim; i++) {
      U[i][j] = { re: r.state[2 * i], im: r.state[2 * i + 1] };
    }
  }

  // Pauli decomposition: β_P = Tr(P† U) / 2ⁿ.
  const numPaulis = 1 << (2 * n); // 4^n
  const labels: string[] = new Array(numPaulis);
  const beta: Complex[] = new Array(numPaulis);
  for (let p = 0; p < numPaulis; p++) {
    const { mat, label } = pauliFromIndex(n, p);
    labels[p] = label;
    let tr: Complex = { re: 0, im: 0 };
    // Tr(P† U) = Σ_i Σ_j conj(P[j,i]) * U[i,j] = Σ_i Σ_j conj(P[j,i]) * U[j,i] for Hermitian P
    // Actually Tr(A B) = Σ_i Σ_j A[i,j] * B[j,i]; with A = P†, we get
    // Σ_i Σ_j conj(P[j,i]) * U[j,i].
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        tr = cadd(tr, cmul(cconj(mat[j][i]), U[j][i]));
      }
    }
    beta[p] = { re: tr.re / dim, im: tr.im / dim };
  }

  // χ_{mn} = β_m · β̄_n
  const chi: Complex[][] = Array.from({ length: numPaulis }, (_, m) =>
    new Array<Complex>(numPaulis).fill({ re: 0, im: 0 } as Complex).map((_, k) => cmul(beta[m], cconj(beta[k]))),
  );

  // Quick "closest named gate" — compare process fidelity F = |Tr(V† U)/2ⁿ|²
  // against a small library of named unitaries.
  let closest: { name: string; fidelity: number } | undefined;
  for (const [name, V] of namedSingleQubit(n)) {
    let tr: Complex = { re: 0, im: 0 };
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        tr = cadd(tr, cmul(cconj(V[j][i]), U[j][i]));
      }
    }
    const f = (tr.re * tr.re + tr.im * tr.im) / (dim * dim);
    if (!closest || f > closest.fidelity) closest = { name, fidelity: f };
  }
  if (closest && closest.fidelity < 0.95) closest = undefined;

  return { n, labels, beta, chi, closestMatch: closest };
}

function namedSingleQubit(n: number): Array<[string, Complex[][]]> {
  if (n !== 1) return [];
  return [
    ["I", I_MAT],
    ["X", X_MAT],
    ["Y", Y_MAT],
    ["Z", Z_MAT],
    ["H", [[{re:Math.SQRT1_2,im:0},{re:Math.SQRT1_2,im:0}],[{re:Math.SQRT1_2,im:0},{re:-Math.SQRT1_2,im:0}]]],
    ["S", [[{re:1,im:0},{re:0,im:0}],[{re:0,im:0},{re:0,im:1}]]],
    ["T", [[{re:1,im:0},{re:0,im:0}],[{re:0,im:0},{re:Math.cos(Math.PI/4),im:Math.sin(Math.PI/4)}]]],
  ];
}
