/**
 * Sparse representation of an n-qubit Pauli string as a signed/phased
 * permutation: P|c⟩ = phase[c] · |perm[c]⟩. Every Pauli operator is exactly
 * one non-zero entry per column, so this is the cheap way to apply a Pauli
 * as a matrix without materialising 2ⁿ × 2ⁿ dense storage.
 *
 * Big-endian convention (matching the rest of the codebase and the Pauli-sum
 * parser): character q of the string is qubit q, qubit 0 is the MSB of the
 * basis index.
 */

export type PauliSparse = {
  /** perm[c] = output basis index when P acts on input basis state c. */
  perm: Int32Array;
  phRe: Float64Array;
  phIm: Float64Array;
};

export function pauliSparse(n: number, pstr: string): PauliSparse {
  const dim = 1 << n;
  const perm = new Int32Array(dim);
  const phRe = new Float64Array(dim);
  const phIm = new Float64Array(dim);
  for (let c = 0; c < dim; c++) {
    let cp = c, re = 1, im = 0;
    for (let q = 0; q < n; q++) {
      const p = pstr[q] ?? "I";
      const bitpos = n - 1 - q;
      const bit = (cp >> bitpos) & 1;
      if (p === "X") {
        cp ^= 1 << bitpos;
      } else if (p === "Y") {
        cp ^= 1 << bitpos;
        // Y|0⟩ = i|1⟩ (bit was 0 ⇒ ×i), Y|1⟩ = −i|0⟩ (bit was 1 ⇒ ×−i).
        if (bit === 0) { const t = re; re = -im; im = t; } // × i
        else { const t = re; re = im; im = -t; } // × −i
      } else if (p === "Z") {
        if (bit === 1) { re = -re; im = -im; }
      }
    }
    perm[c] = cp;
    phRe[c] = re;
    phIm[c] = im;
  }
  return { perm, phRe, phIm };
}
