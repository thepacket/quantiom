/**
 * Full Pauli spectrum of a pure state: ⟨ψ|P|ψ⟩ for *every* one of the 4ⁿ
 * n-qubit Pauli strings. The shared substrate for the discrete-Wigner and
 * magic (stabilizer-Rényi) panels, both of which are transforms of this
 * vector.
 *
 * Cost is 4ⁿ · O(n · 2ⁿ) = O(n · 8ⁿ), so callers must cap n tightly (the
 * panels use n ≤ 4 for Wigner, n ≤ 6 for magic). Strings are indexed in
 * base 4: digit q (q = qubit index, least-significant digit first) selects
 * I/X/Y/Z = 0/1/2/3 on qubit q.
 */

import { paulis, type Pauli } from "./expectation";

const P: Pauli[] = ["I", "X", "Y", "Z"];

export function allPauliExpectations(state: Float64Array, n: number): Float64Array {
  const total = 4 ** n;
  const out = new Float64Array(total);
  const arr: Pauli[] = new Array(n).fill("I");
  for (let p = 0; p < total; p++) {
    let x = p;
    for (let q = 0; q < n; q++) {
      arr[q] = P[x & 3];
      x >>= 2;
    }
    out[p] = paulis(state, n, arr);
  }
  return out;
}
