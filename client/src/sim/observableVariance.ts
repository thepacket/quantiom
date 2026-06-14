/**
 * Observable variance and shot-noise error for a Pauli-sum observable
 * H = Σ_k h_k P_k on a pure state.
 *
 *   ⟨H⟩  = Re⟨ψ|Hψ⟩,
 *   ⟨H²⟩ = ‖Hψ‖²,
 *   Var(H) = ⟨H²⟩ − ⟨H⟩².
 *
 * The standard deviation σ = √Var(H) sets the **shot-noise error bar**: an
 * estimate of ⟨H⟩ from N samples has standard error σ/√N. This is what makes
 * the otherwise-exact Expectation panel honest about finite sampling — a
 * single Pauli has Var = 1 − ⟨P⟩² trivially, but a Hamiltonian's variance is
 * the genuine measurement cost a VQE energy evaluation pays.
 *
 * Hψ is formed term-by-term via the sparse Pauli action (same machinery as
 * the QFI generator). Cost O(|H| · 2ⁿ); statevector path.
 */

import { pauliSparse } from "./pauliMatrix";

export type VarianceResult = {
  mean: number;
  second: number;
  variance: number;
  std: number;
};

export function observableMoments(
  state: Float64Array,
  n: number,
  terms: Array<{ coefficient: number; paulis: string }>,
): VarianceResult {
  const dim = 1 << n;
  const hRe = new Float64Array(dim);
  const hIm = new Float64Array(dim);

  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      const pr = state[2 * c];
      const pi = state[2 * c + 1];
      const ar = phRe[c] * pr - phIm[c] * pi;
      const ai = phRe[c] * pi + phIm[c] * pr;
      const d = perm[c];
      hRe[d] += h * ar;
      hIm[d] += h * ai;
    }
  }

  let mean = 0;
  let second = 0;
  for (let c = 0; c < dim; c++) {
    const pr = state[2 * c];
    const pi = state[2 * c + 1];
    mean += pr * hRe[c] + pi * hIm[c];
    second += hRe[c] * hRe[c] + hIm[c] * hIm[c];
  }
  const variance = Math.max(0, second - mean * mean);
  return { mean, second, variance, std: Math.sqrt(variance) };
}

/** Standard error of an N-shot estimate of ⟨H⟩. */
export function shotError(std: number, shots: number): number {
  return shots > 0 ? std / Math.sqrt(shots) : Infinity;
}
