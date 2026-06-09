/**
 * Classical shadows (random single-qubit Pauli basis), after
 * Huang–Kueng–Preskill 2020.
 *
 * Each *snapshot* measures every qubit in an independently random Pauli basis
 * (X, Y, or Z). From M such snapshots you can estimate many Pauli observables
 * ⟨P⟩ at once — no tailored circuit per observable — with a sample cost that
 * grows with the locality of P, not the system size.
 *
 * Single-snapshot estimator for O = ⊗_q P_q (P_q ∈ {I,X,Y,Z}): the inverse of
 * the single-qubit measurement channel gives, per qubit,
 *   • P_q = I                → factor 1
 *   • P_q ≠ I, basis == P_q  → factor 3 · (+1 if outcome bit 0 else −1)
 *   • P_q ≠ I, basis ≠ P_q   → factor 0  (snapshot carries no info on P_q)
 * The product over qubits is one unbiased sample of ⟨O⟩; the median-of-means
 * over batches is the robust estimate.
 *
 * Sampling is seedable for reproducible tests. Big-endian: qubit q is bit
 * (n − 1 − q) of the basis index.
 */

import { simulate, type ParameterValues } from "./simulate";
import { mulberry32 } from "./measure";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

/** 0 = X, 1 = Y, 2 = Z. */
export type ShadowBasis = 0 | 1 | 2;

export type ClassicalShadows = {
  n: number;
  shots: number;
  /** basis[s][q] ∈ {0,1,2} — the Pauli basis qubit q was measured in. */
  basis: Uint8Array[];
  /** bit[s][q] ∈ {0,1} — the Z-basis outcome after rotating to that basis. */
  bit: Uint8Array[];
};

const SQRT1_2 = Math.SQRT1_2;

/** H on qubit q, in place on an interleaved-re/im state. */
function applyH(st: Float64Array, n: number, q: number) {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  for (let i = 0; i < dim; i++) {
    if (i & mask) continue;
    const j = i | mask;
    const ar = st[2 * i], ai = st[2 * i + 1], br = st[2 * j], bi = st[2 * j + 1];
    st[2 * i] = (ar + br) * SQRT1_2; st[2 * i + 1] = (ai + bi) * SQRT1_2;
    st[2 * j] = (ar - br) * SQRT1_2; st[2 * j + 1] = (ai - bi) * SQRT1_2;
  }
}

/** S† on qubit q (|1⟩ amplitude × −i), in place. */
function applySdg(st: Float64Array, n: number, q: number) {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  for (let i = 0; i < dim; i++) {
    if (!(i & mask)) continue;
    const re = st[2 * i], im = st[2 * i + 1];
    st[2 * i] = im; st[2 * i + 1] = -re; // ×(−i)
  }
}

/** Sample a full basis-index outcome from |amplitude|² using `rng`. */
function sampleIndex(st: Float64Array, dim: number, rng: () => number): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < dim; i++) {
    acc += st[2 * i] * st[2 * i] + st[2 * i + 1] * st[2 * i + 1];
    if (r <= acc) return i;
  }
  return dim - 1;
}

export function buildClassicalShadows(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  shots: number,
  rng: () => number = mulberry32(0x5ade),
): ClassicalShadows | null {
  const n = circuit.numQubits;
  if (n < 1 || n > 12) return null;
  const base = simulate(circuit, paramValues, customGates);
  if (base.isStabilizer) return null;
  const dim = 1 << n;
  const basis: Uint8Array[] = [];
  const bit: Uint8Array[] = [];
  for (let s = 0; s < shots; s++) {
    const b = new Uint8Array(n);
    const st = base.state.slice(); // copy
    for (let q = 0; q < n; q++) {
      const choice = (Math.floor(rng() * 3) % 3) as ShadowBasis;
      b[q] = choice;
      if (choice === 0) applyH(st, n, q); // X: H
      else if (choice === 1) { applySdg(st, n, q); applyH(st, n, q); } // Y: H·S†
      // Z: no rotation
    }
    const idx = sampleIndex(st, dim, rng);
    const bits = new Uint8Array(n);
    for (let q = 0; q < n; q++) bits[q] = (idx >> (n - 1 - q)) & 1;
    basis.push(b);
    bit.push(bits);
  }
  return { n, shots, basis, bit };
}

/** Map a Pauli string ("IXYZ") to per-qubit basis codes; I = −1 (identity). */
function pauliCodes(pauli: string): Int8Array | null {
  const up = pauli.trim().toUpperCase();
  const out = new Int8Array(up.length);
  for (let i = 0; i < up.length; i++) {
    const c = up[i];
    out[i] = c === "X" ? 0 : c === "Y" ? 1 : c === "Z" ? 2 : c === "I" ? -1 : -2;
    if (out[i] === -2) return null;
  }
  return out;
}

/** Single-snapshot unbiased estimate of ⟨P⟩ for one snapshot, or 0. */
function snapshotEstimate(codes: Int8Array, n: number, basis: Uint8Array, bit: Uint8Array): number {
  let prod = 1;
  for (let q = 0; q < n; q++) {
    const pc = codes[q];
    if (pc === -1) continue; // identity
    if (basis[q] !== pc) return 0; // basis mismatch → no info
    prod *= 3 * (bit[q] === 0 ? 1 : -1);
  }
  return prod;
}

/** Median-of-means estimate of ⟨P⟩ from a shadow. `batches` defaults to a
 *  rule-of-thumb (≈ shots / 32, clamped). */
export function estimatePauli(sh: ClassicalShadows, pauli: string, batches?: number): number | null {
  const codes = pauliCodes(pauli);
  if (!codes || codes.length !== sh.n) return null;
  const K = Math.max(1, Math.min(batches ?? (Math.floor(sh.shots / 32) || 1), sh.shots));
  const per = sh.shots / K;
  const means: number[] = [];
  for (let k = 0; k < K; k++) {
    const lo = Math.floor(k * per);
    const hi = Math.floor((k + 1) * per);
    let sum = 0;
    for (let s = lo; s < hi; s++) sum += snapshotEstimate(codes, sh.n, sh.basis[s], sh.bit[s]);
    if (hi > lo) means.push(sum / (hi - lo));
  }
  means.sort((a, b) => a - b);
  const m = means.length;
  return m % 2 ? means[(m - 1) / 2] : (means[m / 2 - 1] + means[m / 2]) / 2;
}

/** Convenience: estimate every single-qubit ⟨Z_q⟩ from a shadow. */
export function estimateAllZ(sh: ClassicalShadows): number[] {
  const out: number[] = [];
  for (let q = 0; q < sh.n; q++) {
    const p = "I".repeat(q) + "Z" + "I".repeat(sh.n - q - 1);
    out.push(estimatePauli(sh, p) ?? 0);
  }
  return out;
}
