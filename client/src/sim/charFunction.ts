/**
 * Discrete characteristic function — the Fourier dual of the discrete Wigner
 * function. For n qubits the Heisenberg–Weyl (Pauli) operators
 * D(u,v) = i^{u·v} X^u Z^v, indexed by (u,v) ∈ {0,1}ⁿ × {0,1}ⁿ, form a
 * phase-space lattice; the characteristic function is
 *
 *   χ(u,v) = ⟨ψ| D(u,v) |ψ⟩.
 *
 * Its magnitude |χ(u,v)| is exactly |⟨P⟩| for the corresponding Pauli string
 * P(u,v) (the i^{u·v} prefactor is a pure phase), so the whole magnitude grid
 * is a reshape of the Pauli spectrum onto the (X-support, Z-support) plane.
 * A pure stabilizer state has |χ| ∈ {0,1} (a flat "comb"); spreading mass
 * over the lattice is the phase-space picture complementary to the Wigner
 * negativity view. Reads at the origin: χ(0,0) = 1 always.
 *
 * Built from `allPauliExpectations`; capped at a small qubit count.
 */

import { allPauliExpectations } from "./pauliSpectrum";

export type CharFuncResult = {
  /** dim × dim magnitude grid (dim = 2ⁿ), |χ(u,v)| ∈ [0,1]; rows = X-support
   *  u, cols = Z-support v. */
  mag: number[][];
  dim: number;
  /** Σ |χ| over the lattice (1 for a single-qubit stabilizer; grows with
   *  phase-space spread). */
  total: number;
};

export function characteristicFunction(
  state: Float64Array,
  n: number,
  maxQubits = 4,
): CharFuncResult | null {
  if (n < 1 || n > maxQubits) return null;
  const exp = allPauliExpectations(state, n);
  const total4 = 4 ** n;
  const dim = 1 << n;
  const mag: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  let total = 0;
  // Pauli digit d per qubit (base-4, qubit q = digit q): I=0,X=1,Y=2,Z=3.
  // Map to (u_q, v_q): I→(0,0), X→(1,0), Y→(1,1), Z→(0,1).
  for (let p = 0; p < total4; p++) {
    let pp = p;
    let u = 0; // X-support (row)
    let v = 0; // Z-support (col)
    for (let q = 0; q < n; q++) {
      const d = pp & 3;
      const uq = d === 1 || d === 2 ? 1 : 0; // X or Y
      const vq = d === 3 || d === 2 ? 1 : 0; // Z or Y
      u |= uq << q;
      v |= vq << q;
      pp >>= 2;
    }
    const m = Math.abs(exp[p]);
    mag[u][v] = m;
    total += m;
  }
  return { mag, dim, total };
}
