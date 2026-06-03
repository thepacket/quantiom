/**
 * Discrete Wigner function of a pure qubit state. Builds the phase-space
 * quasi-probability on the 2ⁿ × 2ⁿ grid from the n-qubit phase-point
 * operators A_u = ⊗_q A_{u_q}, where the four single-qubit phase-point
 * operators are
 *
 *   A_(0,0) = ½(I + X + Y + Z)   A_(0,1) = ½(I − X − Y + Z)
 *   A_(1,0) = ½(I + X − Y − Z)   A_(1,1) = ½(I − X + Y − Z)
 *
 * and W(u) = (1/2ⁿ) Tr(ρ A_u). Expanding A_u in the Pauli basis gives the
 * cheap form W(u) = (1/4ⁿ) Σ_P c_P(u) ⟨P⟩ with signs c_P(u) = ±1, so the
 * whole grid is a sign-fold of the Pauli spectrum.
 *
 * **Reading it.** W sums to 1; **negative cells are the non-classical
 * signal.** Every single-qubit stabilizer (Pauli-eigenstate) is
 * non-negative, and magic states (T|+⟩ …) go negative. NOTE the qubit
 * caveat: unlike odd-dimensional qudits, this tensor-product construction
 * is not Clifford-covariant, so for n ≥ 2 some entangled *stabilizer*
 * states also show negativity — read W as a phase-space picture of
 * non-classicality, and use the Magic (M₂) panel for the rigorous
 * stabilizer measure.
 */

import { allPauliExpectations } from "./pauliSpectrum";

// SIGN[u_q][d] — sign of single-qubit Pauli d ∈ {I,X,Y,Z} in A_{u_q}.
const SIGN = [
  [1, 1, 1, 1], // u=(0,0)
  [1, -1, -1, 1], // u=(0,1)
  [1, 1, -1, -1], // u=(1,0)
  [1, -1, 1, -1], // u=(1,1)
];

export type WignerResult = {
  /** dim × dim quasi-probability grid (dim = 2ⁿ), summing to 1. */
  W: number[][];
  dim: number;
  /** Total negativity Σ_{W<0} |W| (0 for a non-negative / "classical"
   *  state). The 1-norm Σ|W| = 1 + 2·negativity. */
  negativity: number;
  /** Most negative cell value (≤ 0). */
  minW: number;
};

export function discreteWigner(
  state: Float64Array,
  n: number,
  maxQubits = 4,
): WignerResult | null {
  if (n < 1 || n > maxQubits) return null;
  const exp = allPauliExpectations(state, n);
  const total = 4 ** n;
  const dim = 1 << n;
  const W: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  let negativity = 0;
  let minW = 0;
  for (let u = 0; u < total; u++) {
    let acc = 0;
    for (let p = 0; p < total; p++) {
      let sign = 1, uu = u, pp = p;
      for (let q = 0; q < n; q++) {
        sign *= SIGN[uu & 3][pp & 3];
        uu >>= 2;
        pp >>= 2;
      }
      acc += sign * exp[p];
    }
    acc /= total;
    // Decode phase point u into (q-coord, p-coord) per qubit → (row, col).
    let uu = u, row = 0, col = 0;
    for (let q = 0; q < n; q++) {
      const uq = uu & 3;
      col |= (uq & 1) << q;
      row |= ((uq >> 1) & 1) << q;
      uu >>= 2;
    }
    W[row][col] = acc;
    if (acc < 0) negativity += -acc;
    if (acc < minW) minW = acc;
  }
  return { W, dim, negativity, minW };
}
