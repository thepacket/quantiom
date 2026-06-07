/**
 * Simultaneous randomized benchmarking — the crosstalk / addressability test
 * (Gambetta et al., PRL 109, 240504 (2012)).
 *
 * Single-qubit RB is run on each qubit in two conditions: **isolated** (only
 * that qubit driven) and **simultaneous** (every qubit driven at once). If gates
 * were perfectly addressable the two error rates would match; the increase under
 * simultaneous driving is the crosstalk. We report the per-qubit
 * addressability ratio EPC_simul / EPC_iso.
 *
 * The trajectory simulator has no native simultaneous-1q-drive crosstalk
 * channel, so we model the spectator effect on top of each qubit's own rates:
 * under simultaneous driving every coupled neighbour adds `noise.crosstalk`
 * depolarising to the qubit (a standard spectator-error model). With
 * `crosstalk = 0` or no coupling map the ratio is ≈ 1 — a faithful "no
 * crosstalk in this model" answer. Each qubit's RB runs on a one-qubit circuit
 * carrying that qubit's resolved rates, so the sweep stays cheap.
 */

import { randomizedBenchmarking, type RbOptions } from "./randomizedBenchmarking";
import { rateFor, type NoiseModel } from "./noise";
import { mulberry32 } from "./measure";

export type SimultaneousRbResult = {
  qubits: number[];
  /** Error per Clifford with only this qubit driven. */
  isolated: number[];
  /** Error per Clifford with all qubits driven simultaneously. */
  simultaneous: number[];
  /** EPC_simul / EPC_iso per qubit (1 ⇒ perfectly addressable). */
  addressability: number[];
  meanAddressability: number;
  sequences: number;
};

/** A one-qubit noise model carrying qubit q's resolved rates, plus extra
 *  depolarising to fold in simultaneous-drive crosstalk. */
function flatten(noise: NoiseModel, q: number, extraDepol: number): NoiseModel {
  return {
    enabled: true,
    trajectories: noise.trajectories,
    oneQubitDepolarising: Math.min(1, rateFor(noise, "oneQubitDepolarising", q) + extraDepol),
    twoQubitDepolarising: 0,
    amplitudeDamping: rateFor(noise, "amplitudeDamping", q),
    phaseDamping: rateFor(noise, "phaseDamping", q),
    readoutBitFlip: 0,
    crosstalk: 0,
    customKraus: noise.customKraus,
  };
}

export type SimultaneousRbOptions = RbOptions & { qubits?: number[] };

export function simultaneousRb(noise: NoiseModel, opts: SimultaneousRbOptions = {}): SimultaneousRbResult {
  const coupling = noise.coupling;
  const nDev = coupling?.length ?? 4;
  const qubits = opts.qubits ?? Array.from({ length: Math.min(nDev, 4) }, (_, i) => i);
  const seedRng = opts.rng ?? Math.random;

  const isolated: number[] = [], simultaneous: number[] = [], addressability: number[] = [];
  // Paired comparison: isolated and simultaneous reuse the SAME random Clifford
  // sequences AND the same trajectory-noise stream (we temporarily seed
  // Math.random, which `simulateNoisy` draws from), so the ONLY difference is the
  // crosstalk depolarising. With crosstalk 0 the two estimates coincide exactly
  // ⇒ addressability = 1; otherwise the variance cancels and the ratio isolates
  // the spectator error. The extra crosstalk folds into the per-gate depolarising
  // channel, so both runs draw the same number of randoms and stay in sync.
  const origRandom = Math.random;
  try {
    for (const q of qubits) {
      const deg = coupling ? (coupling[q]?.filter((nb) => qubits.includes(nb)).length ?? 0) : qubits.length - 1;
      const seqSeed = Math.floor(seedRng() * 0xffffffff) >>> 0;
      const trajSeed = Math.floor(seedRng() * 0xffffffff) >>> 0;
      const rbOpts = (): RbOptions => ({ lengths: opts.lengths, sequences: opts.sequences, rng: mulberry32(seqSeed) });

      Math.random = mulberry32(trajSeed);
      const iso = randomizedBenchmarking(flatten(noise, q, 0), rbOpts()).epc;
      Math.random = mulberry32(trajSeed);
      const sim = randomizedBenchmarking(flatten(noise, q, noise.crosstalk * deg), rbOpts()).epc;

      isolated.push(iso);
      simultaneous.push(sim);
      addressability.push(iso > 1e-9 ? sim / iso : 1);
    }
  } finally {
    Math.random = origRandom;
  }
  const meanAddressability = addressability.reduce((a, b) => a + b, 0) / Math.max(1, addressability.length);
  return { qubits, isolated, simultaneous, addressability, meanAddressability, sequences: opts.sequences ?? 15 };
}
