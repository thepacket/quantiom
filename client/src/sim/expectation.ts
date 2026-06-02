/**
 * Pauli expectation values: given a Pauli string P = P_{n-1} ⊗ … ⊗ P_0
 * (one P_q ∈ {I, X, Y, Z} per qubit) compute ⟨ψ|P|ψ⟩.
 *
 * The implementation builds a copy of the state, applies each non-identity
 * Pauli in place, then takes the inner product. For a Hermitian P the
 * result is exactly real, so we discard the (vanishing) imaginary part.
 *
 * Cost: O(n · 2^n) — fast enough to recompute every frame on the largest
 * simulated circuits (n ≤ 20).
 */

export type Pauli = "I" | "X" | "Y" | "Z";

/**
 * Observable abstraction: either a single multi-qubit Pauli string (the
 * existing single-observable mode) or a weighted Pauli-sum Hamiltonian
 * (the new VQE-shaped mode). The Expectation panel, Optimise loop,
 * Landscape sweeper, Plateau diagnostic, and ZNE all flow through this
 * type so they work transparently for both observables.
 */
export type Observable =
  | { kind: "pauli"; paulis: Pauli[] }
  | { kind: "sum"; terms: Array<{ coefficient: number; paulis: string }> };

/** Compute ⟨ψ|H|ψ⟩ for a Pauli-sum Hamiltonian H = Σ_k h_k P_k. */
export function pauliSumExpectation(
  state: Float64Array,
  n: number,
  terms: Array<{ coefficient: number; paulis: string }>,
): number {
  let total = 0;
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const pauliArr: Pauli[] = new Array(n);
    for (let q = 0; q < n; q++) {
      const ch = term.paulis[q] ?? "I";
      pauliArr[q] = (ch === "X" || ch === "Y" || ch === "Z" ? ch : "I") as Pauli;
    }
    total += term.coefficient * paulis(state, n, pauliArr);
  }
  return total;
}

/** Evaluate an arbitrary Observable on a pure state. */
export function evaluateObservable(
  state: Float64Array,
  n: number,
  obs: Observable,
): number {
  if (obs.kind === "pauli") return paulis(state, n, obs.paulis);
  return pauliSumExpectation(state, n, obs.terms);
}

/**
 * state is the interleaved-re/im Float64Array of length 2 · 2^n.
 * paulis[q] selects the Pauli on qubit q (big-endian: q = 0 is MSB).
 */
export function paulis(state: Float64Array, n: number, paulis: Pauli[]): number {
  const dim = 1 << n;
  const tempRe = new Float64Array(dim);
  const tempIm = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    tempRe[i] = state[2 * i];
    tempIm[i] = state[2 * i + 1];
  }

  for (let q = 0; q < n; q++) {
    const p = paulis[q];
    if (p === "I") continue;
    const mask = 1 << (n - 1 - q);

    if (p === "X") {
      for (let i = 0; i < dim; i++) {
        if (i & mask) continue;
        const j = i | mask;
        const tr = tempRe[i], ti = tempIm[i];
        tempRe[i] = tempRe[j]; tempIm[i] = tempIm[j];
        tempRe[j] = tr; tempIm[j] = ti;
      }
    } else if (p === "Y") {
      // Y|0⟩ = i|1⟩, Y|1⟩ = −i|0⟩
      for (let i = 0; i < dim; i++) {
        if (i & mask) continue;
        const j = i | mask;
        const i0r = tempRe[i], i0i = tempIm[i];
        const i1r = tempRe[j], i1i = tempIm[j];
        // new amp at bit-q=0 is −i · (old amp at bit-q=1)
        tempRe[i] = i1i;
        tempIm[i] = -i1r;
        // new amp at bit-q=1 is +i · (old amp at bit-q=0)
        tempRe[j] = -i0i;
        tempIm[j] = i0r;
      }
    } else if (p === "Z") {
      for (let i = 0; i < dim; i++) {
        if (i & mask) {
          tempRe[i] = -tempRe[i];
          tempIm[i] = -tempIm[i];
        }
      }
    }
  }

  let re = 0;
  for (let i = 0; i < dim; i++) {
    const pr = state[2 * i];
    const pi = state[2 * i + 1];
    // ⟨ψ|P|ψ⟩_i = conj(ψ_i) · (Pψ)_i; real part is ψ_re * Pψ_re + ψ_im * Pψ_im
    re += pr * tempRe[i] + pi * tempIm[i];
  }
  return re;
}
