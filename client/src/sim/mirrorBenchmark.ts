/**
 * Mirror / volumetric benchmarking (Proctor et al., Nat. Phys. 18, 75 (2022)).
 *
 * A mirror circuit applies a random Clifford layer sequence and then its exact
 * inverse, so the ideal output is the initial |0…0⟩. Running it under noise and
 * recording the success probability P(|0…0⟩) gives a SPAM-light, scalable
 * fidelity proxy that works at any width — no full-circuit Clifford recovery to
 * compute. Sweeping over a (width × depth) grid produces a **volumetric**
 * heatmap: the capability region where the device still returns the right
 * answer. The success probability decays roughly as F ≈ poldepth, so the grid's
 * "frontier" (P ≈ ½) traces the largest circuit shapes the noise model can run.
 *
 * Each forward layer is a column of random single-qubit Cliffords on every
 * qubit followed by a layer of CZ on random disjoint pairs (CZ is its own
 * inverse and Clifford). The mirror half replays the CZ layer and the inverse
 * single-qubit Cliffords in reverse order, guaranteeing identity. Runs under
 * `simulateNoisy`, so a clean model yields P = 1 everywhere.
 */

import type { Circuit, PlacedGate } from "../editor/types";
import { simulateNoisy } from "./simulateNoisy";
import { cliffordGroup } from "./randomizedBenchmarking";
import type { NoiseModel } from "./noise";

export type MirrorResult = {
  widths: number[];
  depths: number[];
  /** success[i][j] = mean P(|0…0⟩) for widths[i], depths[j]. */
  success: number[][];
  circuits: number;
};

let _mid = 0;
function g1(gateId: string, q: number, col: number): PlacedGate {
  return { id: `mb${_mid++}`, gateId: gateId as PlacedGate["gateId"], column: col, controls: [], targets: [q], clbits: [], params: [] };
}
function cz(a: number, b: number, col: number): PlacedGate {
  return { id: `mb${_mid++}`, gateId: "cz", column: col, controls: [a], targets: [b], clbits: [], params: [] };
}

/** Build one mirror circuit of the given width and (forward) depth. */
export function buildMirrorCircuit(width: number, depth: number, rng: () => number): Circuit {
  const { gates: gseq, inv } = cliffordGroup();
  const ncliff = gseq.length;
  const gates: PlacedGate[] = [];
  // One column per emitted gate so application order is unambiguous (gate ids
  // are sorted lexically within a column, which would scramble a multi-gate
  // Clifford expansion sharing a column).
  let col = 0;
  // Record each forward layer so the mirror can invert it exactly.
  const layers: { cliffs: number[]; pairs: [number, number][] }[] = [];
  for (let d = 0; d < depth; d++) {
    const cliffs = Array.from({ length: width }, () => Math.floor(rng() * ncliff) % ncliff);
    for (let q = 0; q < width; q++) for (const gid of gseq[cliffs[q]]) gates.push(g1(gid, q, col++));
    // Random disjoint CZ pairs.
    const order = Array.from({ length: width }, (_, i) => i);
    for (let i = width - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const pairs: [number, number][] = [];
    for (let k = 0; k + 1 < width; k += 2) if (rng() < 0.5) pairs.push([order[k], order[k + 1]]);
    for (const [a, b] of pairs) gates.push(cz(a, b, col++));
    layers.push({ cliffs, pairs });
  }
  // Mirror: reverse layer order, CZ first (self-inverse), then inverse Cliffords.
  for (let d = layers.length - 1; d >= 0; d--) {
    const { cliffs, pairs } = layers[d];
    for (const [a, b] of pairs) gates.push(cz(a, b, col++));
    for (let q = 0; q < width; q++) for (const gid of gseq[inv[cliffs[q]]]) gates.push(g1(gid, q, col++));
  }
  if (gates.length === 0) gates.push(g1("i", 0, col));
  return { numQubits: width, numClbits: 0, gates };
}

export type MirrorOptions = { widths?: number[]; depths?: number[]; circuits?: number; rng?: () => number };

export function mirrorBenchmark(noise: NoiseModel, opts: MirrorOptions = {}): MirrorResult {
  const widths = opts.widths ?? [1, 2, 3, 4];
  const depths = opts.depths ?? [2, 4, 8, 16];
  const C = opts.circuits ?? 6;
  const rng = opts.rng ?? Math.random;

  const success = widths.map((w) =>
    depths.map((d) => {
      let acc = 0;
      for (let c = 0; c < C; c++) {
        const circ = buildMirrorCircuit(w, d, rng);
        acc += simulateNoisy(circ, {}, [], noise).probabilities[0]; // P(|0…0⟩)
      }
      return acc / C;
    }),
  );
  return { widths, depths, success, circuits: C };
}
