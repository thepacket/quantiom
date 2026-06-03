/**
 * Sweep the `t` clock parameter across one period [0, 2π) and record each
 * qubit's ⟨Z⟩ at every sample. Turns an animated circuit's dynamics into
 * a static set of time-series curves — Rabi/Larmor oscillation, Floquet
 * stroboscopic response, Trotterised evolution — without having to watch
 * the animation play.
 *
 * Other free symbols are held at their current parameter values; only `t`
 * is swept. Cost is `points` simulations.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type TSweepResult = {
  /** Sample points of t, in [0, 2π]. */
  ts: number[];
  /** z[q][k] = ⟨Z_q⟩ at ts[k], in [−1, +1]. */
  z: number[][];
  numQubits: number;
};

export function tSweepZ(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 64,
  maxQubits = 14,
): TSweepResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const ts = new Array<number>(points);
  const z: number[][] = Array.from({ length: n }, () => new Array<number>(points).fill(0));
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const bloch = res.blochVectors;
    for (let q = 0; q < n; q++) z[q][k] = bloch[q]?.z ?? 0;
  }
  return { ts, z, numQubits: n };
}

export type TSweepSpectrumResult = {
  /** Frequency-bin index m (= number of full oscillations over one period
   *  [0, 2π)); length = numBins. mag[q][m] is the amplitude at that bin. */
  freqs: number[];
  /** mag[q][m] = |DFT coefficient| of ⟨Z_q⟩(t) at bin m, normalised so a
   *  pure cos(m·t) of unit amplitude reads 1 at bin m. The DC (m = 0) bin
   *  holds the time-average |⟨Z_q⟩|. */
  mag: number[][];
  numQubits: number;
};

/**
 * Fourier spectrum of the ⟨Z_q⟩(t) traces. Samples the `t` clock at `points`
 * equally-spaced points over one *periodic* period [0, 2π) (endpoint
 * excluded, unlike `tSweepZ` which is for plotting) and runs a real DFT per
 * qubit. Reads off Rabi / Larmor / Floquet frequencies as peaks: a single
 * rx(t) shows one peak at bin 1, a doubled-frequency drive at bin 2, a
 * Floquet period-doubling response at the half-integer line, etc.
 *
 * Cost is `points` simulations + an O(points · numBins) DFT per qubit.
 * Statevector path only.
 */
export function tSweepSpectrum(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  points = 128,
  maxQubits = 14,
): TSweepSpectrumResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  // Periodic sampling: t_k = 2π·k/points, k = 0 … points−1 (no duplicate endpoint).
  const samples: number[][] = Array.from({ length: n }, () => new Array<number>(points).fill(0));
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / points;
    const res = simulate(circuit, { ...paramValues, t }, customGates);
    const bloch = res.blochVectors;
    for (let q = 0; q < n; q++) samples[q][k] = bloch[q]?.z ?? 0;
  }

  const numBins = Math.floor(points / 2) + 1;
  const freqs = Array.from({ length: numBins }, (_, m) => m);
  const mag: number[][] = Array.from({ length: n }, () => new Array<number>(numBins).fill(0));
  for (let q = 0; q < n; q++) {
    for (let m = 0; m < numBins; m++) {
      let re = 0, im = 0;
      for (let k = 0; k < points; k++) {
        const phi = (-2 * Math.PI * m * k) / points;
        re += samples[q][k] * Math.cos(phi);
        im += samples[q][k] * Math.sin(phi);
      }
      // Normalise: DC by 1/points, AC bins by 2/points so a unit-amplitude
      // cosine reads exactly 1 at its bin.
      const norm = m === 0 ? 1 / points : 2 / points;
      mag[q][m] = Math.hypot(re, im) * norm;
    }
  }
  return { freqs, mag, numQubits: n };
}
