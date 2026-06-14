/**
 * Negativity spectrum — the eigenvalues of the partial transpose ρ^{T_A} of
 * the global pure state across a chosen bipartition A | B. A genuine
 * entanglement signature: ρ^{T_A} has Tr = 1 but develops **negative**
 * eigenvalues exactly when A and B are entangled, and
 *
 *   negativity 𝒩 = Σ_{λ<0} |λ|,   log-negativity E_N = log₂(2𝒩 + 1) = log₂‖ρ^{T_A}‖₁.
 *
 * Where the Negativity panel shows one scalar per qubit pair, this shows the
 * full eigenvalue distribution across an arbitrary cut — the negative tail is
 * the entanglement. Builds the dense 2ⁿ×2ⁿ ρ, so capped at a small n.
 */

import type { Complex } from "./density";
import { densityEigenvaluesSigned } from "./entanglement";

export type NegativitySpectrumResult = {
  /** Eigenvalues of ρ^{T_A}, sorted ascending (negatives first). */
  eigenvalues: number[];
  negativity: number;
  logNegativity: number;
};

export function negativitySpectrum(
  state: Float64Array,
  n: number,
  subsetA: number[],
  maxQubits = 6,
): NegativitySpectrumResult | null {
  if (n < 2 || n > maxQubits) return null;
  if (subsetA.length === 0 || subsetA.length >= n) return null;
  const dim = 1 << n;
  // Bit position (big-endian) for qubit q is (n-1-q). Build masks for A bits.
  const aMask = subsetA.reduce((m, q) => m | (1 << (n - 1 - q)), 0);

  // Dense ρ = |ψ⟩⟨ψ|, then partial transpose on A: swap the A-bits of row/col.
  // ρ^{T_A}[i][j] = ρ[ (i_B | j_A) ][ (j_B | i_A) ].
  const PT: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const iA = i & aMask, iB = i & ~aMask;
      const jA = j & aMask, jB = j & ~aMask;
      const r = iB | jA; // row with A-bits swapped to j's
      const c = jB | iA; // col with A-bits swapped to i's
      // ρ[r][c] = ψ_r · conj(ψ_c)
      const rr = state[2 * r], ri = state[2 * r + 1];
      const cr = state[2 * c], ci = state[2 * c + 1];
      PT[i][j] = { re: rr * cr + ri * ci, im: ri * cr - rr * ci };
    }
  }

  const eigenvalues = densityEigenvaluesSigned(PT).sort((a, b) => a - b);
  let negativity = 0;
  for (const e of eigenvalues) if (e < 0) negativity += -e;
  const logNegativity = Math.log2(2 * negativity + 1);
  return { eigenvalues, negativity, logNegativity };
}
