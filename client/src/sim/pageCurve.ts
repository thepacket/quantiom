/**
 * Page curve — the entanglement-entropy profile across every contiguous cut
 * with the analytic Page value of a Haar-random pure state overlaid.
 *
 * For a random pure state of the whole register, the average entanglement
 * entropy of a subsystem A of Hilbert dimension d_A (with d_A ≤ d_B, the rest)
 * is the Page value (Page 1993), in nats:
 *
 *   S_page = ( Σ_{k=d_A+1}^{d_A·d_B} 1/k ) − (d_A − 1)/(2 d_B).
 *
 * Converted to bits (÷ ln 2) it sits just below the maximal value
 * min(|A|,|B|) bits: the famous "Page arch" peaking at the half-cut. A state
 * that traces the Page curve is maximally scrambled / volume-law; a gapped
 * ground state stays flat near zero (area law); a product state is zero.
 *
 * Reuses `entropyProfile` for the actual S(cut) and its max-entropy bound,
 * then adds the Page line per cut. Statevector path only.
 */

import { entropyProfile } from "./entanglement";

export type PageCurveResult = {
  /** S(ρ_{[0..k]}) for the cut after qubit k, in bits; length n−1 (NaN where
   *  the cut's smaller side exceeds the cap). */
  entropy: number[];
  /** Analytic Page value at each cut, in bits. Same length. */
  page: number[];
  /** Maximal entropy min(|A|,|B|) at each cut, in bits. Same length. */
  maxEntropy: number[];
  numQubits: number;
};

/** Page average entanglement entropy in bits for subsystem sizes (mA, mB)
 *  qubits, with d_A = 2^mA, d_B = 2^mB. */
export function pageEntropyBits(mA: number, mB: number): number {
  // Work with the smaller side as A (the formula assumes d_A ≤ d_B).
  const a = Math.min(mA, mB);
  const b = Math.max(mA, mB);
  const dA = 2 ** a;
  const dB = 2 ** b;
  let harmonic = 0;
  for (let k = dA + 1; k <= dA * dB; k++) harmonic += 1 / k;
  const nats = harmonic - (dA - 1) / (2 * dB);
  return Math.max(0, nats) / Math.LN2;
}

export function pageCurve(
  state: Float64Array,
  n: number,
  maxSide = 8,
): PageCurveResult | null {
  if (n < 2) return null;
  const prof = entropyProfile(state, n, maxSide);
  if (!prof) return null;
  const page = new Array<number>(n - 1).fill(0);
  for (let k = 0; k < n - 1; k++) {
    const sizeA = k + 1;
    const sizeB = n - sizeA;
    page[k] = pageEntropyBits(sizeA, sizeB);
  }
  return { entropy: prof.entropy, page, maxEntropy: prof.maxEntropy, numQubits: n };
}
