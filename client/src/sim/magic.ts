/**
 * Non-stabilizerness ("magic") of a pure state, via the **stabilizer
 * 2-Rényi entropy** of Leone–Oliviero–Hamma (PRL 128, 050402, 2022):
 *
 *   Ξ_P = ⟨ψ|P|ψ⟩² / 2ⁿ          (a probability distribution over Paulis)
 *   M₂  = −log₂( Σ_P Ξ_P² ) − n
 *
 * M₂ ≥ 0, and M₂ = 0 **iff** |ψ⟩ is a stabilizer state — so it measures
 * how far the state is from anything the Clifford fast path could
 * represent. It's additive under tensor products and invariant under
 * Clifford gates; only T-like (non-Clifford) gates raise it. The natural
 * scalar companion to the stabilizer simulator.
 *
 * Reads the full Pauli spectrum (4ⁿ expectations), so callers cap n.
 */

export type MagicResult = {
  /** Stabilizer 2-Rényi entropy M₂ in bits (0 = stabilizer state). */
  m2: number;
  /** Σ_{|P|=w} Ξ_P for each Pauli weight w (number of non-identity
   *  factors), w = 0 … n. The weight-0 entry is always 2⁻ⁿ (⟨I⟩ = 1);
   *  the distribution's spread toward high weight is a scrambling /
   *  operator-growth signature. */
  weightDist: number[];
};

export function magic(exp: Float64Array, n: number): MagicResult {
  const fourN = 4 ** n;
  const twoN = 1 << n;
  let s4 = 0;
  const weightDist = new Array<number>(n + 1).fill(0);
  const normXi = 1 / twoN;
  for (let p = 0; p < fourN; p++) {
    const e = exp[p];
    const e2 = e * e;
    s4 += e2 * e2;
    // Pauli weight = count of non-identity digits.
    let x = p, w = 0;
    for (let q = 0; q < n; q++) {
      if (x & 3) w++;
      x >>= 2;
    }
    weightDist[w] += e2 * normXi;
  }
  const m2 = Math.max(0, -Math.log2(s4 / fourN) - n);
  return { m2, weightDist };
}
