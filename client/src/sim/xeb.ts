/**
 * Cross-entropy benchmarking (XEB) — the Google supremacy-style fidelity metric
 * (Arute et al., Nature 574, 505 (2019)).
 *
 * A random circuit of `depth` cycles is built: each cycle is a random single-
 * qubit gate (chosen per qubit from {√X, √Y, T}, never repeating the previous
 * one on that qubit) followed by an entangling CZ layer in a fixed brickwork
 * pattern. Deep random circuits produce Porter–Thomas output statistics; the
 * **linear XEB fidelity** estimator
 *     F_XEB = Σ_x (p_noisy−1/D)(p_ideal−1/D) / Σ_x (p_ideal−1/D)²,  D = 2ⁿ,
 * is 1 for a perfect device (p_noisy = p_ideal) and 0 for the fully depolarised
 * uniform distribution — at any depth — and decays exponentially with cycle
 * count under noise. Averaged over several random circuits per depth.
 *
 * Computed exactly from the full distributions (no shot sampling), so a clean
 * model returns F ≈ 1 at every depth and noise pulls it down.
 */

import type { Circuit, PlacedGate } from "../editor/types";
import { simulate } from "./simulate";
import { simulateNoisy } from "./simulateNoisy";
import type { NoiseModel } from "./noise";

export type XebResult = {
  depths: number[];
  /** Mean linear XEB fidelity at each depth. */
  fidelity: number[];
  /** Fitted per-cycle fidelity decay λ in F ≈ λ^depth. */
  perCycle: number;
  numQubits: number;
  circuits: number;
};

const SQ_GATES = ["sx", "sy", "t"] as const;

let _xid = 0;
function g1(gateId: string, q: number, col: number): PlacedGate {
  return { id: `xeb${_xid++}`, gateId: gateId as PlacedGate["gateId"], column: col, controls: [], targets: [q], clbits: [], params: [] };
}
function cz(a: number, b: number, col: number): PlacedGate {
  return { id: `xeb${_xid++}`, gateId: "cz", column: col, controls: [a], targets: [b], clbits: [], params: [] };
}

/** One random circuit: `depth` cycles of random 1q gates + brickwork CZ. */
export function buildXebCircuit(n: number, depth: number, rng: () => number): Circuit {
  const gates: PlacedGate[] = [];
  const prev = new Array<number>(n).fill(-1);
  let col = 0;
  for (let d = 0; d < depth; d++) {
    for (let q = 0; q < n; q++) {
      let pick = Math.floor(rng() * SQ_GATES.length);
      if (pick === prev[q]) pick = (pick + 1) % SQ_GATES.length; // don't repeat
      prev[q] = pick;
      gates.push(g1(SQ_GATES[pick], q, col));
    }
    col++;
    // Brickwork CZ: even pairs on even cycles, odd pairs on odd cycles.
    const start = d % 2;
    for (let q = start; q + 1 < n; q += 2) gates.push(cz(q, q + 1, col));
    col++;
  }
  if (gates.length === 0) gates.push(g1("sx", 0, col));
  return { numQubits: n, numClbits: 0, gates };
}

/** Linear XEB fidelity estimator from full ideal + measured distributions:
 *  F = Σ(m−1/D)(i−1/D) / Σ(i−1/D)²  (= 1 ideal, 0 uniform). Returns null for a
 *  degenerate (uniform) ideal distribution, which carries no XEB signal. */
function linearXeb(ideal: ArrayLike<number>, measured: ArrayLike<number>, dim: number): number | null {
  const u = 1 / dim;
  let num = 0, den = 0;
  for (let i = 0; i < dim; i++) {
    const di = ideal[i] - u;
    num += (measured[i] - u) * di;
    den += di * di;
  }
  return den > 1e-9 ? num / den : null;
}

export type XebOptions = { numQubits?: number; depths?: number[]; circuits?: number; rng?: () => number };

export function xeb(noise: NoiseModel, opts: XebOptions = {}): XebResult {
  const n = opts.numQubits ?? 4;
  const depths = opts.depths ?? [1, 2, 4, 6, 8, 12, 16];
  const C = opts.circuits ?? 8;
  const rng = opts.rng ?? Math.random;
  const dim = 1 << n;

  const fidelity = depths.map((d) => {
    let acc = 0, valid = 0;
    for (let c = 0; c < C; c++) {
      const circ = buildXebCircuit(n, d, rng);
      const ideal = simulate(circ, {}, []).probabilities;
      const measured = noise.enabled ? simulateNoisy(circ, {}, [], noise).probabilities : ideal;
      const f = linearXeb(ideal, measured, dim);
      if (f !== null) { acc += f; valid++; } // skip degenerate (uniform-ideal) circuits
    }
    return valid > 0 ? acc / valid : 1;
  });

  // Per-cycle decay: fit ln F = depth·ln λ over positive points.
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < depths.length; i++) if (fidelity[i] > 1e-3) { xs.push(depths[i]); ys.push(Math.log(fidelity[i])); }
  let perCycle = 1;
  if (xs.length >= 2) {
    const np = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
    const slope = (np * sxy - sx * sy) / (np * sxx - sx * sx || 1);
    perCycle = Math.min(1, Math.exp(slope));
  }
  return { depths, fidelity, perCycle, numQubits: n, circuits: C };
}
