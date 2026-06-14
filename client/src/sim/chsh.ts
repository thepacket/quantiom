/**
 * CHSH / Bell-nonlocality map. For each qubit pair the 3×3 correlation matrix
 * T_ij = ⟨σ_i^a σ_j^b⟩ (i, j ∈ {x, y, z}) determines the maximal achievable
 * CHSH value via the Horodecki criterion:
 *
 *   S_max = 2 √(t₁² + t₂²),
 *
 * where t₁ ≥ t₂ are the two largest singular values of T. **S_max > 2** means
 * the pair's reduced state violates the CHSH inequality — a device-independent
 * certificate of nonlocality (stronger than mere entanglement; a Werner state
 * can be entangled yet local). A maximally entangled pair reaches the Tsirelson
 * bound 2√2 ≈ 2.828. Reuses Pauli expectations on the global state; the two
 * largest singular values come from the eigenvalues of TᵀT.
 */

import { paulis, type Pauli } from "./expectation";
import { eig3 } from "./eig";

const AXES = ["X", "Y", "Z"] as const;

export type ChshResult = {
  /** s[a][b] = maximal CHSH value for the (a,b) pair; symmetric, 0 diagonal. */
  s: number[][];
  numQubits: number;
  /** Largest CHSH value over all pairs. */
  max: number;
};

export function chshMap(state: Float64Array, n: number, maxQubits = 12): ChshResult | null {
  if (n < 2 || n > maxQubits) return null;
  const s: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let max = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      // Correlation matrix T_ij = ⟨σ_i^a σ_j^b⟩.
      const T: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const arr: Pauli[] = new Array(n).fill("I");
          arr[a] = AXES[i];
          arr[b] = AXES[j];
          T[i][j] = paulis(state, n, arr);
        }
      }
      // TᵀT (symmetric); its eigenvalues are the squared singular values.
      const M: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let acc = 0;
        for (let k = 0; k < 3; k++) acc += T[k][i] * T[k][j];
        M[i][j] = acc;
      }
      const ev = eig3(M); // ascending
      const t1sq = Math.max(0, ev[2]);
      const t2sq = Math.max(0, ev[1]);
      const smax = 2 * Math.sqrt(t1sq + t2sq);
      s[a][b] = smax;
      s[b][a] = smax;
      if (smax > max) max = smax;
    }
  }
  return { s, numQubits: n, max };
}
