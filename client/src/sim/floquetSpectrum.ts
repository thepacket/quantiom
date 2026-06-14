/**
 * Floquet quasi-energy spectrum — the eigenphases of the circuit unitary U
 * (the one-period Floquet operator), e^{iθ_k}, distributed on the unit circle.
 *
 * U is **normal** (unitary), so it commutes with its Hermitian parts
 * H_c = (U + U†)/2 and H_s = (U − U†)/2i and shares their eigenvectors. We
 * diagonalise the Hermitian combination M = H_c + α·H_s (α breaks the cos θ
 * degeneracy between ±θ), then read each quasi-energy off as the
 * Rayleigh-quotient phase θ_k = arg⟨v_k|U|v_k⟩ (exact, since v_k is an
 * eigenvector of U). No general complex eigensolver needed. The level-spacing
 * of {θ_k} is the Floquet analogue of energy-level statistics — Poisson
 * (integrable) vs circular-ensemble repulsion (chaotic). Builds the dense U,
 * capped at a small n, run on demand.
 */

import type { Complex } from "./density";
import { hermitianEig } from "./eig";
import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type FloquetResult = {
  /** Quasi-energies θ_k ∈ (−π, π]. */
  quasiEnergies: number[];
  /** Normalised consecutive spacings s_i = Δθ_i / mean(Δθ) (sorted θ). */
  spacings: number[];
  /** Mean consecutive-gap ratio ⟨r⟩ (Poisson ≈ 0.386, COE ≈ 0.527). */
  meanR: number;
};

export function floquetSpectrum(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  maxQubits = 6,
): FloquetResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;

  // Dense U (column j = U|j⟩).
  const Ure: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Uim: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  for (let j = 0; j < dim; j++) {
    const psi = simulate(circuit, paramValues, customGates, { startIndex: j }).state;
    for (let i = 0; i < dim; i++) { Ure[i][j] = psi[2 * i]; Uim[i][j] = psi[2 * i + 1]; }
  }

  // M = H_c + α H_s, Hermitian. H_c = (U+U†)/2, H_s = (U−U†)/2i.
  const alpha = 0.1 + Math.PI / 100; // irrational-ish, breaks ±θ degeneracy
  const M: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      // U†[i][j] = conj(U[j][i]).
      const udRe = Ure[j][i], udIm = -Uim[j][i];
      const hcRe = (Ure[i][j] + udRe) / 2, hcIm = (Uim[i][j] + udIm) / 2;
      // H_s = (U − U†)/(2i) = (U − U†)·(−i/2)
      const dRe = Ure[i][j] - udRe, dIm = Uim[i][j] - udIm;
      const hsRe = dIm / 2, hsIm = -dRe / 2;
      M[i][j] = { re: hcRe + alpha * hsRe, im: hcIm + alpha * hsIm };
    }
  }

  const { vectors } = hermitianEig(M);
  const quasiEnergies: number[] = vectors.map((v) => {
    // ⟨v|U|v⟩ = Σ_{i,j} conj(v_i) U[i][j] v_j.
    let re = 0, im = 0;
    for (let i = 0; i < dim; i++) {
      // (U v)_i = Σ_j U[i][j] v_j
      let uvRe = 0, uvIm = 0;
      for (let j = 0; j < dim; j++) {
        uvRe += Ure[i][j] * v[j].re - Uim[i][j] * v[j].im;
        uvIm += Ure[i][j] * v[j].im + Uim[i][j] * v[j].re;
      }
      re += v[i].re * uvRe + v[i].im * uvIm;
      im += v[i].re * uvIm - v[i].im * uvRe;
    }
    return Math.atan2(im, re);
  });

  const sorted = [...quasiEnergies].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const meanGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;
  const spacings = gaps.map((g) => g / (meanGap || 1));
  const ratios: number[] = [];
  for (let i = 1; i < gaps.length; i++) {
    const a = gaps[i - 1], b = gaps[i];
    const mx = Math.max(a, b);
    if (mx > 1e-15) ratios.push(Math.min(a, b) / mx);
  }
  const meanR = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  return { quasiEnergies, spacings, meanR };
}
