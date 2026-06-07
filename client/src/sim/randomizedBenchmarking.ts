/**
 * Single-qubit randomized benchmarking (RB).
 *
 * Protocol: for each sequence length m, draw K sequences of m uniformly-random
 * single-qubit Cliffords, append the one recovery Clifford that inverts the
 * product (so the noiseless result is |0⟩), run each under the noise model,
 * and record the **survival probability** P(|0⟩). Averaged over the K
 * sequences, P decays as
 *
 *     P(m) = A · p^m + B,   B = 1/2,
 *
 * where p is the depolarising parameter; the **error per Clifford** is
 * r = (1 − p)(1 − 1/d) = (1 − p)/2 for d = 2. RB is robust to state-prep and
 * measurement error (they sit in A and B), so r isolates the gate error.
 *
 * The 24-element single-qubit Clifford group is enumerated by BFS over {H, S}
 * on 2×2 matrices (deduped up to global phase), giving each element a native
 * gate sequence plus composition/inverse tables. Runs under `simulateNoisy`,
 * so it needs a noise model to show any decay.
 */

import { simulateNoisy } from "./simulateNoisy";
import type { NoiseModel } from "./noise";
import type { Circuit, PlacedGate } from "../editor/types";

export type RbResult = {
  /** Sequence lengths m. */
  lengths: number[];
  /** Mean survival probability P(|0⟩) at each length. */
  survival: number[];
  /** Fitted depolarising parameter p. */
  p: number;
  /** Error per Clifford r = (1 − p)/2. */
  epc: number;
  /** Fit amplitude A and offset B (B = 0.5). */
  A: number;
  B: number;
  sequences: number;
};

type C2 = [number, number, number, number, number, number, number, number]; // [a,b,c,d] complex row-major (re,im pairs)

const cmul = (ar: number, ai: number, br: number, bi: number): [number, number] => [ar * br - ai * bi, ar * bi + ai * br];

function matmul(X: C2, Y: C2): C2 {
  // 2×2 complex: rows [ [X0 X1],[X2 X3] ] · [ [Y0 Y1],[Y2 Y3] ]
  const out = new Array(8).fill(0) as unknown as C2;
  const idx = [[0, 1], [2, 3]];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    let re = 0, im = 0;
    for (let k = 0; k < 2; k++) {
      const xr = X[idx[i][k] * 2], xi = X[idx[i][k] * 2 + 1];
      const yr = Y[idx[k][j] * 2], yi = Y[idx[k][j] * 2 + 1];
      const [pr, pi] = cmul(xr, xi, yr, yi);
      re += pr; im += pi;
    }
    out[(i * 2 + j) * 2] = re; out[(i * 2 + j) * 2 + 1] = im;
  }
  return out;
}

function dagger(X: C2): C2 {
  // conjugate transpose
  return [X[0], -X[1], X[4], -X[5], X[2], -X[3], X[6], -X[7]] as C2;
}

/** Canonical key up to global phase: rotate so the first significant entry is real+. */
function canon(X: C2): string {
  let fr = 0, fi = 0;
  for (let i = 0; i < 4; i++) { const re = X[i * 2], im = X[i * 2 + 1]; if (Math.hypot(re, im) > 1e-6) { fr = re; fi = im; break; } }
  const mag = Math.hypot(fr, fi) || 1;
  const pr = fr / mag, pi = -fi / mag; // e^{-iφ}
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const [re, im] = cmul(X[i * 2], X[i * 2 + 1], pr, pi);
    parts.push(`${Math.round(re * 1e4) / 1e4},${Math.round(im * 1e4) / 1e4}`);
  }
  return parts.join("|");
}

const M_I: C2 = [1, 0, 0, 0, 0, 0, 1, 0];
const M_H: C2 = [Math.SQRT1_2, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, -Math.SQRT1_2, 0];
const M_S: C2 = [1, 0, 0, 0, 0, 0, 0, 1];

/** 2×2 matrices for the single-qubit gates that are themselves Cliffords —
 *  used by interleaved RB to look up the interleaved gate's group index. */
const GATE_MATS: Record<string, C2> = {
  i: M_I,
  x: [0, 0, 1, 0, 1, 0, 0, 0],
  y: [0, 0, 0, -1, 0, 1, 0, 0],
  z: [1, 0, 0, 0, 0, 0, -1, 0],
  h: M_H,
  s: M_S,
  sdg: [1, 0, 0, 0, 0, 0, 0, -1],
  sx: [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
  sxdg: [0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5],
};

/** The single-qubit gates that are Cliffords (valid interleaved-RB targets). */
export const INTERLEAVED_GATES = ["x", "y", "z", "h", "s", "sdg", "sx", "sxdg"] as const;

type Clifford = { seq: string[]; mat: C2 };

/** Build the 24-element single-qubit Clifford group with gate sequences + tables. */
function buildCliffords(): { gates: string[][]; comp: number[][]; inv: number[]; indexOf: (m: C2) => number } {
  const elems: Clifford[] = [];
  const keyToIdx = new Map<string, number>();
  const add = (mat: C2, seq: string[]): number => {
    const k = canon(mat);
    const existing = keyToIdx.get(k);
    if (existing !== undefined) return existing;
    const idx = elems.length;
    keyToIdx.set(k, idx);
    elems.push({ seq, mat });
    return idx;
  };
  add(M_I, []);
  // BFS applying H and S generators.
  const gens: Array<{ g: string; m: C2 }> = [{ g: "h", m: M_H }, { g: "s", m: M_S }];
  for (let head = 0; head < elems.length && elems.length < 24; head++) {
    const cur = elems[head];
    for (const { g, m } of gens) {
      const mat = matmul(m, cur.mat); // apply cur then g
      add(mat, [...cur.seq, g]);
      if (elems.length >= 24) break;
    }
  }
  const n = elems.length;
  const comp: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    comp[i][j] = keyToIdx.get(canon(matmul(elems[j].mat, elems[i].mat)))!; // apply i then j
  }
  const inv = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) inv[i] = keyToIdx.get(canon(dagger(elems[i].mat)))!;
  const indexOf = (m: C2): number => keyToIdx.get(canon(m))!;
  return { gates: elems.map((e) => e.seq), comp, inv, indexOf };
}

let _grp: ReturnType<typeof buildCliffords> | null = null;
const group = () => (_grp ??= buildCliffords());

/** The 24-element single-qubit Clifford group: native-gate sequences plus the
 *  composition (`comp[i][j]` = apply i then j) and inverse (`inv`) tables.
 *  Shared by mirror benchmarking and simultaneous RB. */
export function cliffordGroup(): { gates: string[][]; comp: number[][]; inv: number[] } {
  const g = group();
  return { gates: g.gates, comp: g.comp, inv: g.inv };
}

function gate(gateId: string, column: number): PlacedGate {
  return { id: `rb${column}`, gateId: gateId as PlacedGate["gateId"], column, controls: [], targets: [0], clbits: [], params: [] };
}

/** Linear fit of ln(P − B) = ln A + m·ln p over points with P > B. */
function fitDecay(lengths: number[], survival: number[], B: number): { A: number; p: number } {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < lengths.length; i++) {
    const y = survival[i] - B;
    if (y > 1e-3) { xs.push(lengths[i]); ys.push(Math.log(y)); }
  }
  if (xs.length < 2) return { A: Math.max(0, survival[0] - B), p: 1 };
  const npts = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = npts * sxx - sx * sx || 1;
  const slope = (npts * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / npts;
  return { A: Math.exp(intercept), p: Math.min(1, Math.exp(slope)) };
}

export type RbOptions = { lengths?: number[]; sequences?: number; rng?: () => number };

/**
 * Build one RB sequence of m random Cliffords (plus inverting recovery),
 * optionally interleaving a fixed Clifford gate after every random one.
 * Returns the gate list on qubit 0.
 */
function buildSequence(
  m: number,
  rng: () => number,
  interleave: number | null,
  gseq: string[][],
  comp: number[][],
  inv: number[],
): PlacedGate[] {
  const ncliff = gseq.length;
  let composite = 0; // identity (index 0)
  const seqGates: PlacedGate[] = [];
  let col = 0;
  for (let g = 0; g < m; g++) {
    const c = Math.floor(rng() * ncliff) % ncliff;
    for (const gid of gseq[c]) seqGates.push(gate(gid, col++));
    composite = comp[composite][c];
    if (interleave !== null) {
      for (const gid of gseq[interleave]) seqGates.push(gate(gid, col++));
      composite = comp[composite][interleave];
    }
  }
  const recovery = inv[composite];
  for (const gid of gseq[recovery]) seqGates.push(gate(gid, col++));
  if (seqGates.length === 0) seqGates.push(gate("i", col++));
  return seqGates;
}

/** Mean survival probability P(|0⟩) at each length under the noise model. */
function survivalSweep(noise: NoiseModel, lengths: number[], K: number, rng: () => number, interleave: number | null): number[] {
  const { gates: gseq, comp, inv } = group();
  const survival: number[] = [];
  for (const m of lengths) {
    let acc = 0;
    for (let k = 0; k < K; k++) {
      const seqGates = buildSequence(m, rng, interleave, gseq, comp, inv);
      const circuit: Circuit = { numQubits: 1, numClbits: 0, gates: seqGates };
      acc += simulateNoisy(circuit, {}, [], noise).probabilities[0];
    }
    survival.push(acc / K);
  }
  return survival;
}

export function randomizedBenchmarking(noise: NoiseModel, opts: RbOptions = {}): RbResult {
  const lengths = opts.lengths ?? [1, 2, 4, 8, 16, 24, 32, 48, 64];
  const K = opts.sequences ?? 15;
  const rng = opts.rng ?? Math.random;
  const survival = survivalSweep(noise, lengths, K, rng, null);
  const B = 0.5;
  const { A, p } = fitDecay(lengths, survival, B);
  return { lengths, survival, p, epc: (1 - p) / 2, A, B, sequences: K };
}

export type InterleavedRbResult = {
  gateId: string;
  reference: RbResult;
  interleaved: RbResult;
  /** Depolarising parameter of the interleaved sequence. */
  pInterleaved: number;
  /** Gate error of the interleaved Clifford: r = (1 − p_int/p_ref)(1 − 1/d). */
  gateError: number;
  /** Systematic uncertainty bound on r (Magesan 2012, Eq. 5). */
  bound: number;
};

/**
 * Interleaved RB — isolates the error of a *specific* Clifford gate. Runs a
 * reference RB sweep (p_ref) and a second sweep where the target gate is
 * interleaved after every random Clifford (p_int). The gate error is
 *     r = (1 − p_int/p_ref)·(1 − 1/d) = (1 − p_int/p_ref)/2   (d = 2),
 * with the standard systematic bound from Magesan et al. (PRL 109, 080505).
 */
export function interleavedRb(noise: NoiseModel, gateId: string, opts: RbOptions = {}): InterleavedRbResult {
  const lengths = opts.lengths ?? [1, 2, 4, 8, 16, 24, 32, 48, 64];
  const K = opts.sequences ?? 15;
  const rng = opts.rng ?? Math.random;
  const mat = GATE_MATS[gateId];
  if (!mat) throw new Error(`interleavedRb: ${gateId} is not a single-qubit Clifford`);
  const idx = group().indexOf(mat);

  const refSurv = survivalSweep(noise, lengths, K, rng, null);
  const intSurv = survivalSweep(noise, lengths, K, rng, idx);
  const B = 0.5;
  const refFit = fitDecay(lengths, refSurv, B);
  const intFit = fitDecay(lengths, intSurv, B);
  const reference: RbResult = { lengths, survival: refSurv, p: refFit.p, epc: (1 - refFit.p) / 2, A: refFit.A, B, sequences: K };
  const interleaved: RbResult = { lengths, survival: intSurv, p: intFit.p, epc: (1 - intFit.p) / 2, A: intFit.A, B, sequences: K };

  const ratio = refFit.p > 1e-9 ? intFit.p / refFit.p : 1;
  const gateError = (1 - ratio) / 2; // (1 − p_int/p_ref)(1 − 1/d), d = 2
  // Magesan et al. (PRL 109, 080505) systematic bound for d = 2 (d²−1 = 3).
  const pr = Math.max(1e-6, refFit.p), pi = intFit.p;
  const e1 = (1 / 2) * (Math.abs(pr - pi / pr) + (1 - pr));
  const e2 = (3 * (1 - pr)) / (2 * pr) + (4 * Math.sqrt(3) * Math.sqrt(Math.max(0, 1 - pr))) / pr;
  const bound = Math.min(e1, e2);
  return { gateId, reference, interleaved, pInterleaved: intFit.p, gateError, bound };
}

export type UnitarityResult = {
  lengths: number[];
  /** Mean purity-like quantity Tr(ρ²) at each length. */
  purity: number[];
  /** Fitted unitarity u (coherence of the error). */
  u: number;
  /** Fit amplitude A in (purity − 1/d) = A·u^(m−1). */
  A: number;
  sequences: number;
};

/**
 * Unitarity RB — measures the *coherence* of the error via purity decay. For
 * each length m, random Clifford sequences (no recovery) are run under the
 * noise model with the trajectory-averaged density matrix ρ; the purity-like
 * quantity ⟨Tr(ρ²)⟩ decays as (Tr(ρ²) − 1/d) = A·u^(m−1). u = 1 ⇒ purely
 * coherent (unitary) error; u = p² ⇒ purely depolarising. Comparing u with the
 * RB decay p flags coherent (calibration) vs stochastic error.
 */
export function unitarityRb(noise: NoiseModel, opts: RbOptions = {}): UnitarityResult {
  const lengths = opts.lengths ?? [1, 2, 3, 4, 6, 8, 12, 16];
  const K = opts.sequences ?? 15;
  const rng = opts.rng ?? Math.random;
  const { gates: gseq, comp, inv } = group();
  const d = 2;

  const purity: number[] = [];
  for (const m of lengths) {
    let acc = 0;
    for (let k = 0; k < K; k++) {
      // No recovery for unitarity — purity is basis-independent.
      let composite = 0;
      const seqGates: PlacedGate[] = [];
      let col = 0;
      for (let g = 0; g < m; g++) {
        const c = Math.floor(rng() * gseq.length) % gseq.length;
        for (const gid of gseq[c]) seqGates.push(gate(gid, col++));
        composite = comp[composite][c];
      }
      void inv;
      if (seqGates.length === 0) seqGates.push(gate("i", col++));
      const circuit: Circuit = { numQubits: 1, numClbits: 0, gates: seqGates };
      const res = simulateNoisy(circuit, {}, [], noise, { density: true });
      acc += purityOf(res.densityMatrix!, d);
    }
    purity.push(acc / K);
  }

  // Fit (purity − 1/d) = A·u^(m−1) ⇒ ln(purity − 1/d) linear in (m−1).
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < lengths.length; i++) {
    const y = purity[i] - 1 / d;
    if (y > 1e-4) { xs.push(lengths[i] - 1); ys.push(Math.log(y)); }
  }
  let u = 1, A = Math.max(0, purity[0] - 1 / d);
  if (xs.length >= 2) {
    const np = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
    const denom = np * sxx - sx * sx || 1;
    const slope = (np * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / np;
    u = Math.min(1, Math.exp(slope));
    A = Math.exp(intercept);
  }
  return { lengths, purity, u, A, sequences: K };
}

/** Tr(ρ²) from an interleaved-re/im density matrix of dimension d. */
function purityOf(rho: Float64Array, d: number): number {
  let acc = 0;
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
    const k = (i * d + j) * 2;
    acc += rho[k] * rho[k] + rho[k + 1] * rho[k + 1];
  }
  return acc;
}
