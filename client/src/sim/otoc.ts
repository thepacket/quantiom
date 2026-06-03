/**
 * Out-of-time-order correlator (OTOC) over the `t` clock — the standard
 * diagnostic of quantum information scrambling and operator spreading.
 *
 * With a local "butterfly" operator W on qubit a and a "measurement"
 * operator V on qubit b (both Hermitian Paulis), the Heisenberg-evolved
 * W(t) = U_t† W U_t, and the OTOC on the fiducial state |0…0⟩ is
 *
 *   F(t) = ⟨ψ| W(t) V W(t) V |ψ⟩,   C(t) = 1 − Re F(t).
 *
 * C(t) ≈ 0 while W(t) and V still commute (the butterfly hasn't reached b);
 * it grows toward 1+ as the operator front arrives — the rise time over the
 * a–b distance is the butterfly velocity. Here U_t is the whole circuit
 * evaluated at clock value t.
 *
 * Built from the dense unitary at each sample (columns via `simulate`),
 * capped at a small qubit count.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Pauli } from "./expectation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type OtocResult = {
  ts: number[];
  /** C[k] = 1 − Re F(ts[k]); 0 = unscrambled, grows as operators spread. */
  C: number[];
  /** Re F(t), for reference. */
  reF: number[];
  numQubits: number;
};

/** Apply a single-qubit Pauli to a state vector in place. */
function applyPauli1(re: Float64Array, im: Float64Array, n: number, qubit: number, p: Pauli) {
  if (p === "I") return;
  const dim = 1 << n;
  const mask = 1 << (n - 1 - qubit);
  if (p === "Z") {
    for (let i = 0; i < dim; i++) if (i & mask) { re[i] = -re[i]; im[i] = -im[i]; }
    return;
  }
  for (let i = 0; i < dim; i++) {
    if (i & mask) continue;
    const j = i | mask;
    if (p === "X") {
      const tr = re[i], ti = im[i];
      re[i] = re[j]; im[i] = im[j];
      re[j] = tr; im[j] = ti;
    } else { // Y: Y|0⟩=i|1⟩, Y|1⟩=−i|0⟩
      const i0r = re[i], i0i = im[i], i1r = re[j], i1i = im[j];
      re[i] = i1i; im[i] = -i1r;
      re[j] = -i0i; im[j] = i0r;
    }
  }
}

/** out = M · v (or M† · v when dagger), dense complex matrix, row-major. */
function matVec(Ure: Float64Array, Uim: Float64Array, dim: number, vRe: Float64Array, vIm: Float64Array, dagger: boolean): [Float64Array, Float64Array] {
  const oRe = new Float64Array(dim);
  const oIm = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let sr = 0, si = 0;
    for (let j = 0; j < dim; j++) {
      // element = U[i][j], or for dagger U†[i][j] = conj(U[j][i]).
      const ur = dagger ? Ure[j * dim + i] : Ure[i * dim + j];
      const ui = dagger ? -Uim[j * dim + i] : Uim[i * dim + j];
      const xr = vRe[j], xi = vIm[j];
      sr += ur * xr - ui * xi;
      si += ur * xi + ui * xr;
    }
    oRe[i] = sr; oIm[i] = si;
  }
  return [oRe, oIm];
}

export function otoc(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  wQubit: number,
  vQubit: number,
  wPauli: Pauli = "Z",
  vPauli: Pauli = "Z",
  points = 48,
  maxQubits = 6,
): OtocResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  if (wQubit < 0 || wQubit >= n || vQubit < 0 || vQubit >= n) return null;
  const dim = 1 << n;

  const ts = new Array<number>(points);
  const C = new Array<number>(points);
  const reF = new Array<number>(points);

  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    // Dense U_t.
    const Ure = new Float64Array(dim * dim);
    const Uim = new Float64Array(dim * dim);
    for (let j = 0; j < dim; j++) {
      const psi = simulate(circuit, { ...paramValues, t }, customGates, { startIndex: j }).state;
      for (let i = 0; i < dim; i++) {
        Ure[i * dim + j] = psi[2 * i];
        Uim[i * dim + j] = psi[2 * i + 1];
      }
    }
    // |ψ⟩ = |0…0⟩.
    let re: Float64Array = new Float64Array(dim); re[0] = 1;
    let im: Float64Array = new Float64Array(dim);
    // Apply, right to left: W(t) V W(t) V.
    const applyWt = () => {
      [re, im] = matVec(Ure, Uim, dim, re, im, false); // U
      applyPauli1(re, im, n, wQubit, wPauli);          // W
      [re, im] = matVec(Ure, Uim, dim, re, im, true);  // U†
    };
    applyPauli1(re, im, n, vQubit, vPauli); // V
    applyWt();
    applyPauli1(re, im, n, vQubit, vPauli); // V
    applyWt();
    // F = ⟨0…0|result⟩ = result[0].
    reF[k] = re[0];
    C[k] = 1 - re[0];
  }
  return { ts, C, reF, numQubits: n };
}
