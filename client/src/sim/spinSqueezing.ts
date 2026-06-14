/**
 * Spin-squeezing parameter (Wineland) ξ_R² — the metrological figure of merit
 * for a collective spin of N qubits and a multipartite-entanglement witness.
 *
 * With the collective spin J_α = ½ Σ_i σ_α^(i), the mean spin points along
 * n̂ = ⟨J⟩/|⟨J⟩|, and the Wineland squeezing parameter is
 *
 *   ξ_R² = N · (ΔJ_⊥,min)² / |⟨J⟩|²,
 *
 * the smallest spin variance in the plane perpendicular to the mean,
 * normalised by the coherent-state value. ξ_R² < 1 certifies metrological
 * squeezing useful beyond the standard quantum limit AND witnesses
 * (multipartite) entanglement; the phase-estimation gain over shot noise is
 * −10 log₁₀ ξ_R² dB. A spin-coherent (product) state has ξ_R² = 1; GHZ has
 * |⟨J⟩| = 0 (no squeezing in this metric — use QFI there).
 *
 * Computes the mean spin vector and the 3×3 symmetric covariance via Pauli
 * expectations, then minimises over the perpendicular plane. Statevector
 * path; cost O(n² · 2ⁿ).
 */

import { paulis, type Pauli } from "./expectation";

const AXES = ["X", "Y", "Z"] as const;
type Axis = (typeof AXES)[number];

function single(state: Float64Array, n: number, axis: Axis, q: number): number {
  const arr: Pauli[] = new Array(n).fill("I");
  arr[q] = axis;
  return paulis(state, n, arr);
}

function pair(state: Float64Array, n: number, aAxis: Axis, i: number, bAxis: Axis, j: number): number {
  const arr: Pauli[] = new Array(n).fill("I");
  arr[i] = aAxis;
  arr[j] = bAxis;
  return paulis(state, n, arr);
}

export type SpinSqueezingResult = {
  /** Mean spin vector ⟨J⟩ = (⟨Jx⟩,⟨Jy⟩,⟨Jz⟩). */
  mean: [number, number, number];
  /** |⟨J⟩|. */
  meanLength: number;
  /** Minimum spin variance in the plane ⊥ to the mean. */
  minPerpVariance: number;
  /** Wineland ξ_R² (Infinity when |⟨J⟩| ≈ 0). */
  xiR2: number;
  /** Metrological gain −10 log₁₀ ξ_R² in dB (0 when not defined). */
  dB: number;
  /** True iff ξ_R² < 1 (squeezed ⇒ entangled & useful). */
  squeezed: boolean;
};

export function spinSqueezing(state: Float64Array, n: number, maxQubits = 14): SpinSqueezingResult | null {
  if (n < 2 || n > maxQubits) return null;

  // Mean spin m_a = ½ Σ_i ⟨σ_a^i⟩.
  const m: number[] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += single(state, n, AXES[a], i);
    m[a] = 0.5 * s;
  }

  // Symmetric second moment SymS_ab = ¼[ Σ_{i≠j} ⟨σ_a^i σ_b^j⟩ + n·δ_ab ].
  // (Same-site symmetric part of σ_a σ_b is δ_ab·I.)
  const C: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let a = 0; a < 3; a++) {
    for (let b = a; b < 3; b++) {
      let acc = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          acc += pair(state, n, AXES[a], i, AXES[b], j);
        }
      }
      let sym = 0.25 * acc;
      if (a === b) sym += 0.25 * n;
      const cov = sym - m[a] * m[b];
      C[a][b] = cov;
      C[b][a] = cov;
    }
  }

  const meanLength = Math.hypot(m[0], m[1], m[2]);
  if (meanLength < 1e-9) {
    return {
      mean: [m[0], m[1], m[2]],
      meanLength,
      minPerpVariance: 0,
      xiR2: Infinity,
      dB: 0,
      squeezed: false,
    };
  }

  // Orthonormal basis {e1, e2} of the plane ⊥ to the mean direction û.
  const u = [m[0] / meanLength, m[1] / meanLength, m[2] / meanLength];
  // Pick a helper not parallel to û.
  const helper = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = normalize(cross(u, helper));
  const e2 = normalize(cross(u, e1));

  // 2×2 covariance in the plane.
  const cee = (x: number[], y: number[]) => {
    let s = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += x[a] * C[a][b] * y[b];
    return s;
  };
  const m11 = cee(e1, e1);
  const m22 = cee(e2, e2);
  const m12 = cee(e1, e2);
  const tr = m11 + m22;
  const det = m11 * m22 - m12 * m12;
  const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
  const minPerpVariance = Math.max(0, (tr - disc) / 2);

  const xiR2 = (n * minPerpVariance) / (meanLength * meanLength);
  const dB = xiR2 > 0 ? -10 * Math.log10(xiR2) : 0;
  return {
    mean: [m[0], m[1], m[2]],
    meanLength,
    minPerpVariance,
    xiR2,
    dB,
    squeezed: xiR2 < 1 - 1e-9,
  };
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a: number[]): number[] {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}
