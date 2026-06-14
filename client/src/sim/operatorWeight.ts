/**
 * Operator weight growth — how a local operator spreads under Heisenberg
 * evolution by the circuit. Starting from a single-qubit Pauli W on a chosen
 * qubit, the Heisenberg-evolved operator W(t) = U_t† W U_t is decomposed in
 * the Pauli basis, W(t) = Σ_P c_P(t) P, and the weight |c_P|² is bucketed by
 * the Pauli's support size (number of non-identity factors). The resulting
 * distribution over weights, swept across the `t` clock, is the microscopic
 * picture of scrambling underneath the butterfly velocity: weight starts
 * concentrated at 1 and migrates to higher support as the operator grows.
 *
 * Σ_P |c_P|² = 1 at every time (W is a normalised Pauli, W(t) stays a unit
 * Frobenius operator), so each column of the heatmap is a probability
 * distribution. Built from the dense unitary per time sample; run on demand,
 * small qubit cap.
 */

import { simulate, type ParameterValues } from "./simulate";
import { pauliSparse } from "./pauliMatrix";
import type { Pauli } from "./expectation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type OperatorWeightResult = {
  ts: number[];
  /** weights[k][w] = Σ_{|P|=w} |c_P(ts[k])|², w = 0 … n. Each row sums to 1. */
  weights: number[][];
  numQubits: number;
};

const LETTER: Pauli[] = ["I", "X", "Y", "Z"];

export function operatorWeightGrowth(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  wQubit = 0,
  wPauli: Pauli = "Z",
  points = 24,
  maxQubits = 4,
): OperatorWeightResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  if (wQubit < 0 || wQubit >= n) return null;
  const dim = 1 << n;
  const fourN = 4 ** n;

  // Dense W0 (single-qubit Pauli on wQubit) as a signed permutation.
  const w0Str = Array.from({ length: n }, (_, q) => (q === wQubit ? wPauli : "I")).join("");
  const { perm: w0Perm, phRe: w0Re, phIm: w0Im } = pauliSparse(n, w0Str);

  // Precompute each Pauli string's sparse form + weight.
  const pauliForms: Array<{ perm: Int32Array | number[]; phRe: Float64Array; phIm: Float64Array; weight: number }> = [];
  for (let p = 0; p < fourN; p++) {
    let x = p;
    let weight = 0;
    const chars: string[] = new Array(n);
    for (let q = 0; q < n; q++) {
      const d = x & 3;
      chars[q] = LETTER[d];
      if (d !== 0) weight++;
      x >>= 2;
    }
    const sp = pauliSparse(n, chars.join(""));
    pauliForms.push({ perm: sp.perm, phRe: sp.phRe, phIm: sp.phIm, weight });
  }

  const ts = new Array<number>(points);
  const weights: number[][] = [];

  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    // Dense U_t (column j = U|j⟩).
    const Ure = new Float64Array(dim * dim);
    const Uim = new Float64Array(dim * dim);
    for (let j = 0; j < dim; j++) {
      const psi = simulate(circuit, { ...paramValues, t }, customGates, { startIndex: j }).state;
      for (let i = 0; i < dim; i++) {
        Ure[i * dim + j] = psi[2 * i];
        Uim[i * dim + j] = psi[2 * i + 1];
      }
    }
    // W(t) = U† W0 U. First M = W0 U (W0 is a signed permutation: row a of W0
    // hits column w0Perm[a]); then W = U† M.
    const Mre = new Float64Array(dim * dim);
    const Mim = new Float64Array(dim * dim);
    for (let a = 0; a < dim; a++) {
      const src = w0Perm[a]; // (W0)_{a, src} = phase
      const pr = w0Re[a], pi = w0Im[a];
      for (let c = 0; c < dim; c++) {
        const ur = Ure[src * dim + c], ui = Uim[src * dim + c];
        Mre[a * dim + c] = pr * ur - pi * ui;
        Mim[a * dim + c] = pr * ui + pi * ur;
      }
    }
    const Wt = (i: number, j: number): [number, number] => {
      // (U† M)_{ij} = Σ_a conj(U_{ai}) M_{aj}
      let re = 0, im = 0;
      for (let a = 0; a < dim; a++) {
        const ur = Ure[a * dim + i], ui = Uim[a * dim + i]; // U_{ai}
        const mr = Mre[a * dim + j], mi = Mim[a * dim + j];
        re += ur * mr + ui * mi; // conj(U)·M real part
        im += ur * mi - ui * mr;
      }
      return [re, im];
    };
    // Materialise W(t).
    const Wre = new Float64Array(dim * dim);
    const Wim = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) {
      const [re, im] = Wt(i, j);
      Wre[i * dim + j] = re;
      Wim[i * dim + j] = im;
    }

    const row = new Array<number>(n + 1).fill(0);
    for (const f of pauliForms) {
      // c_P = (1/2ⁿ) Σ_b ph[b] · W[b][perm[b]]  (real for Hermitian P, W).
      let cr = 0, ci = 0;
      for (let b = 0; b < dim; b++) {
        const pr = f.phRe[b], pi = f.phIm[b];
        const wr = Wre[b * dim + f.perm[b]], wi = Wim[b * dim + f.perm[b]];
        cr += pr * wr - pi * wi;
        ci += pr * wi + pi * wr;
      }
      cr /= dim;
      ci /= dim;
      row[f.weight] += cr * cr + ci * ci;
    }
    weights.push(row);
  }
  return { ts, weights, numQubits: n };
}
