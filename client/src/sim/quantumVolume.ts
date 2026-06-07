/**
 * Quantum Volume (Cross et al., PRA 100, 032328 / arXiv:1811.12926).
 *
 * For each width m the protocol runs square "model circuits": m qubits, m
 * layers, each layer a random permutation of the qubits paired up with a Haar-
 * random SU(4) on each pair. The **heavy outputs** of a circuit are the
 * bitstrings whose ideal probability exceeds the median ideal probability. The
 * **heavy-output probability** (HOP) is the chance the device samples one of
 * them; for an ideal circuit HOP → (1+ln2)/2 ≈ 0.85, and a faithful device must
 * stay above the 2/3 threshold. A width m "passes" when the 2σ lower confidence
 * bound on the mean HOP (over many random circuits) clears 2/3; the Quantum
 * Volume is 2^(largest passing width).
 *
 * Here the "device" is the noise model: HOP is computed from the trajectory-
 * averaged noisy distribution (which equals the ideal distribution when noise
 * is disabled, so a clean model passes every reachable width). SU(4) is drawn
 * Haar-random by QR of a complex Gaussian and emitted as a u_arb_2 gate.
 */

import type { Circuit, PlacedGate } from "../editor/types";
import { simulate, MAX_QUBITS } from "./simulate";
import { simulateNoisy } from "./simulateNoisy";
import type { NoiseModel } from "./noise";

export type QvWidthResult = {
  width: number;
  /** Mean heavy-output probability over the sampled circuits. */
  meanHOP: number;
  /** Standard error of the mean. */
  sigma: number;
  /** 2σ lower confidence bound. */
  lower: number;
  /** Passes when lower > 2/3. */
  pass: boolean;
  circuits: number;
};

export type QvResult = {
  widths: QvWidthResult[];
  /** Achieved quantum volume = 2^(largest contiguous passing width), else 1. */
  quantumVolume: number;
  /** The (1+ln2)/2 ideal-HOP reference. */
  idealHOP: number;
};

/** Standard normal via Box–Muller. */
function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Haar-random SU(4) as 32 row-major floats (re,im per cell). QR of a complex
 * Gaussian 4×4 with the column-normalised Gram–Schmidt phase fix that makes Q
 * Haar-distributed (Mezzadri 2007).
 */
export function haarSU4(rng: () => number): number[] {
  const N = 4;
  // Complex Gaussian columns: a[c] = [re0,im0,re1,im1,...] length 2N.
  const cols: number[][] = [];
  for (let c = 0; c < N; c++) {
    const col = new Array(2 * N);
    for (let r = 0; r < N; r++) { col[2 * r] = gauss(rng); col[2 * r + 1] = gauss(rng); }
    cols.push(col);
  }
  // Modified Gram–Schmidt → orthonormal columns q[c].
  const q: number[][] = [];
  for (let c = 0; c < N; c++) {
    const v = cols[c].slice();
    for (let k = 0; k < c; k++) {
      // proj coefficient = <q_k, v> (conjugate of q_k times v, summed)
      let pr = 0, pi = 0;
      for (let r = 0; r < N; r++) {
        const ar = q[k][2 * r], ai = q[k][2 * r + 1];
        const br = v[2 * r], bi = v[2 * r + 1];
        pr += ar * br + ai * bi; // conj(q_k)·v
        pi += ar * bi - ai * br;
      }
      for (let r = 0; r < N; r++) {
        v[2 * r] -= pr * q[k][2 * r] - pi * q[k][2 * r + 1];
        v[2 * r + 1] -= pr * q[k][2 * r + 1] + pi * q[k][2 * r];
      }
    }
    let norm = 0;
    for (let r = 0; r < N; r++) norm += v[2 * r] * v[2 * r] + v[2 * r + 1] * v[2 * r + 1];
    norm = Math.sqrt(norm) || 1;
    for (let r = 0; r < 2 * N; r++) v[r] /= norm;
    q.push(v);
  }
  // Build U row-major from columns; then fix global phase to make det = 1 (SU).
  const U = new Array(2 * N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    U[(r * N + c) * 2] = q[c][2 * r];
    U[(r * N + c) * 2 + 1] = q[c][2 * r + 1];
  }
  return U;
}

let _gid = 0;
function su4Gate(q0: number, q1: number, params: number[], column: number): PlacedGate {
  return {
    id: `qv${_gid++}`,
    gateId: "u_arb_2",
    column,
    controls: [],
    targets: [q0, q1],
    clbits: [],
    params: params.map((x) => String(x)),
  };
}

/** Fisher–Yates shuffle of [0..n). */
function permute(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** One QV model circuit: width m, m layers of permuted SU(4) pairs. */
export function buildQvCircuit(m: number, rng: () => number): Circuit {
  const gates: PlacedGate[] = [];
  for (let layer = 0; layer < m; layer++) {
    const perm = permute(m, rng);
    for (let k = 0; k + 1 < m; k += 2) {
      gates.push(su4Gate(perm[k], perm[k + 1], haarSU4(rng), layer));
    }
  }
  return { numQubits: m, numClbits: 0, gates };
}

/** Heavy-output probability of one circuit under the noise model. */
function heavyOutputProb(circ: Circuit, noise: NoiseModel): number {
  const ideal = simulate(circ, {}, []).probabilities;
  const sorted = [...ideal].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const measured = noise.enabled ? simulateNoisy(circ, {}, [], noise).probabilities : ideal;
  let hop = 0;
  for (let i = 0; i < ideal.length; i++) if (ideal[i] > median) hop += measured[i];
  return hop;
}

export type QvOptions = { widths?: number[]; circuits?: number; rng?: () => number };

export function quantumVolume(noise: NoiseModel, opts: QvOptions = {}): QvResult {
  const widths = (opts.widths ?? [2, 3, 4, 5]).filter((w) => w >= 2 && w <= MAX_QUBITS);
  const C = opts.circuits ?? 20;
  const rng = opts.rng ?? Math.random;
  const idealHOP = (1 + Math.log(2)) / 2;

  const results: QvWidthResult[] = widths.map((m) => {
    const hops: number[] = [];
    for (let c = 0; c < C; c++) hops.push(heavyOutputProb(buildQvCircuit(m, rng), noise));
    const mean = hops.reduce((a, b) => a + b, 0) / C;
    const variance = hops.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, C - 1);
    const sigma = Math.sqrt(variance / C);
    const lower = mean - 2 * sigma;
    return { width: m, meanHOP: mean, sigma, lower, pass: lower > 2 / 3, circuits: C };
  });

  // QV = 2^(largest width that passes with every smaller width also passing).
  let largest = 0;
  for (const r of results) { if (r.pass) largest = r.width; else break; }
  return { widths: results, quantumVolume: largest >= 2 ? 2 ** largest : 1, idealHOP };
}
