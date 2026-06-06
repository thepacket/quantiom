/**
 * Quantum Fisher Information (QFI) for phase estimation — the metrological
 * figure of merit and a multipartite-entanglement witness.
 *
 * For a PURE state |ψ⟩ and a Hermitian generator G (the phase is imprinted by
 * e^{-iθG}), the QFI is four times the generator variance:
 *
 *     F_Q[ψ, G] = 4 (⟨G²⟩ − ⟨G⟩²) = 4 Var_ψ(G).
 *
 * With the collective-spin generator J_α = ½ Σ_i σ_α^(i) (α ∈ {x,y,z}) on N
 * qubits, F_Q has hard bounds:
 *   • separable states:        F_Q ≤ N          (standard quantum limit, SQL)
 *   • k-producible witness:    F_Q > N  ⇒ the state is entangled and useful
 *   • maximal (e.g. GHZ):      F_Q = N²         (Heisenberg limit)
 * so F_Q / N > 1 is a device-independent entanglement witness and quantifies
 * the metrological gain over the shot-noise limit.
 *
 * We compute Gψ exactly by applying the Pauli-sum generator term-by-term
 * (sparse Pauli action), then ⟨G⟩ = Re⟨ψ|Gψ⟩ and ⟨G²⟩ = ‖Gψ‖². Cost
 * O(|G| · 2ⁿ); fine to the statevector cap.
 */

import { pauliSparse } from "./pauliMatrix";

export type GeneratorTerm = { coefficient: number; paulis: string };

export type QfiResult = {
  /** ⟨G⟩. */
  expG: number;
  /** ⟨G²⟩. */
  expG2: number;
  /** Var(G) = ⟨G²⟩ − ⟨G⟩². */
  variance: number;
  /** F_Q = 4 Var(G). */
  qfi: number;
  /** F_Q / N — the metrological gain (separable ≤ 1, witnesses entanglement when > 1). */
  qfiDensity: number;
  /** Standard quantum limit for the collective generator = N. */
  sql: number;
  /** Heisenberg limit = N². */
  heisenberg: number;
  /** True iff F_Q > N (state is entangled and metrologically useful). */
  witnessesEntanglement: boolean;
};

/** The collective-spin generator J_α = ½ Σ_i σ_α on n qubits. */
export function collectiveSpinGenerator(n: number, axis: "X" | "Y" | "Z"): GeneratorTerm[] {
  const terms: GeneratorTerm[] = [];
  for (let q = 0; q < n; q++) {
    const p = Array.from({ length: n }, (_, k) => (k === q ? axis : "I")).join("");
    terms.push({ coefficient: 0.5, paulis: p });
  }
  return terms;
}

/** QFI of a pure state for a Pauli-sum generator G. */
export function quantumFisherPure(state: Float64Array, n: number, generator: GeneratorTerm[]): QfiResult {
  const dim = 1 << n;
  const gRe = new Float64Array(dim);
  const gIm = new Float64Array(dim);

  for (const term of generator) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      const pr = state[2 * c];
      const pi = state[2 * c + 1];
      // (phase · ψ_c), phase = phRe + i·phIm
      const ar = phRe[c] * pr - phIm[c] * pi;
      const ai = phRe[c] * pi + phIm[c] * pr;
      const d = perm[c];
      gRe[d] += h * ar;
      gIm[d] += h * ai;
    }
  }

  let expG = 0;
  let expG2 = 0;
  for (let c = 0; c < dim; c++) {
    const pr = state[2 * c];
    const pi = state[2 * c + 1];
    // Re⟨ψ|Gψ⟩ = Re( conj(ψ_c) · Gψ_c )
    expG += pr * gRe[c] + pi * gIm[c];
    expG2 += gRe[c] * gRe[c] + gIm[c] * gIm[c];
  }

  const variance = Math.max(0, expG2 - expG * expG);
  const qfi = 4 * variance;
  return {
    expG,
    expG2,
    variance,
    qfi,
    qfiDensity: n > 0 ? qfi / n : 0,
    sql: n,
    heisenberg: n * n,
    witnessesEntanglement: qfi > n + 1e-9,
  };
}
