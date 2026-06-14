/**
 * Infinite-temperature temporal autocorrelation of a single-qubit Z:
 *
 *   C(t) = (1/2ⁿ) Tr[ Z_q(t) Z_q(0) ] = (1/2ⁿ) Σ_{a,b} z_a z_b |U_t[b][a]|²,
 *
 * where Z_q(t) = U_t† Z_q U_t and z_a = ±1 is the Z eigenvalue of basis state
 * a on qubit q. This two-time correlator measures how long the qubit's
 * polarisation "remembers" itself under the dynamics — it stays near 1 for a
 * conserved/localized mode and decays to 0 for a thermalizing one. Its Fourier
 * transform is the spectral function (relaxation peaks). State-independent
 * (infinite-T average); built from the dense unitary per sample, run on demand.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type AutocorrelationResult = {
  ts: number[];
  /** C(t) ∈ [−1, 1]; C(0) = 1. */
  C: number[];
  /** Spectral bins (number of oscillations over the period). */
  freqs: number[];
  /** |FT of C(t)| at each bin. */
  spectrum: number[];
  numQubits: number;
};

export function temporalAutocorrelation(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  qubit = 0,
  points = 48,
  maxQubits = 6,
): AutocorrelationResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  if (qubit < 0 || qubit >= n) return null;
  const dim = 1 << n;
  const mask = 1 << (n - 1 - qubit);
  const z = new Int8Array(dim);
  for (let a = 0; a < dim; a++) z[a] = a & mask ? -1 : 1;

  const ts = new Array<number>(points);
  const C = new Array<number>(points);
  for (let k = 0; k < points; k++) {
    const t = (2 * Math.PI * k) / (points - 1);
    ts[k] = t;
    // Dense U_t column-by-column.
    const Umag2 = new Float64Array(dim * dim); // |U[b][a]|²
    for (let a = 0; a < dim; a++) {
      const psi = simulate(circuit, { ...paramValues, t }, customGates, { startIndex: a }).state;
      for (let b = 0; b < dim; b++) {
        const re = psi[2 * b], im = psi[2 * b + 1];
        Umag2[b * dim + a] = re * re + im * im;
      }
    }
    let acc = 0;
    for (let a = 0; a < dim; a++) for (let b = 0; b < dim; b++) acc += z[a] * z[b] * Umag2[b * dim + a];
    C[k] = acc / dim;
  }

  // Real DFT for the spectral function (periodic sampling reused from points).
  const numBins = Math.floor(points / 2) + 1;
  const freqs = Array.from({ length: numBins }, (_, m) => m);
  const spectrum = new Array<number>(numBins).fill(0);
  for (let m = 0; m < numBins; m++) {
    let re = 0, im = 0;
    for (let k = 0; k < points; k++) {
      const phi = (-2 * Math.PI * m * k) / points;
      re += C[k] * Math.cos(phi);
      im += C[k] * Math.sin(phi);
    }
    spectrum[m] = Math.hypot(re, im) * (m === 0 ? 1 / points : 2 / points);
  }
  return { ts, C, freqs, spectrum, numQubits: n };
}
