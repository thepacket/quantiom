/**
 * Static structure factor S(k) — the momentum-space order parameter.
 *
 *   S(k) = (1/N) Σ_{j,l} cos(k (j − l)) · C(j, l),
 *
 * the spatial Fourier transform of the connected ZZ correlator
 * C(j,l) = ⟨Z_j Z_l⟩ − ⟨Z_j⟩⟨Z_l⟩ along a 1-D chain of N qubits (qubit
 * index = chain position). A Bragg peak in S(k) is the signature of
 * spatial order:
 *   • peak at k = 0    → ferromagnetic / uniform order,
 *   • peak at k = π    → antiferromagnetic (Néel) order,
 *   • peak at k = 2π/λ → a density wave of wavelength λ.
 *
 * Real and even in k (C is real symmetric), so we sample k ∈ [0, π].
 * Reads the connected correlator, so O(N² + N·K). Pure-state path.
 */

import { zzCorrelations } from "./correlations";

export type StructureFactorResult = {
  /** Sampled momenta k ∈ [0, π]. */
  k: number[];
  /** S(k) at each momentum. */
  s: number[];
  /** Momentum of the dominant peak. */
  peakK: number;
  /** S at the peak. */
  peakS: number;
  numQubits: number;
};

export function structureFactor(
  state: Float64Array,
  n: number,
  samples = 96,
  maxQubits = 16,
): StructureFactorResult | null {
  if (n < 2 || n > maxQubits) return null;
  const zz = zzCorrelations(state, n, maxQubits);
  if (!zz) return null;
  const C = zz.conn;

  const k: number[] = [];
  const s: number[] = [];
  let peakK = 0;
  let peakS = -Infinity;
  for (let m = 0; m < samples; m++) {
    const km = (Math.PI * m) / (samples - 1);
    let acc = 0;
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < n; l++) {
        acc += Math.cos(km * (j - l)) * C[j][l];
      }
    }
    acc /= n;
    k.push(km);
    s.push(acc);
    if (acc > peakS) { peakS = acc; peakK = km; }
  }
  return { k, s, peakK, peakS, numQubits: n };
}
