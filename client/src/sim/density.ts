/**
 * Reduced density matrix ρ_S = Tr_{S^c}(|ψ⟩⟨ψ|) for a chosen subset S of
 * qubits. The result is a 2^|S| × 2^|S| matrix of complex numbers.
 *
 * Convention: qubit 0 is the MSB of the global basis index; within ρ,
 * the kept qubits supply the row/column index with kept[0] as MSB.
 *
 * Cost: O(2^n · 4^|S|) — fine for |S| ≤ 4 on a 20-qubit state.
 */

export type Complex = { re: number; im: number };

export function reducedDensityMatrix(
  state: Float64Array,
  n: number,
  kept: number[],
): Complex[][] {
  const k = kept.length;
  const dimK = 1 << k;
  const traced: number[] = [];
  for (let q = 0; q < n; q++) {
    if (!kept.includes(q)) traced.push(q);
  }
  const dimT = 1 << traced.length;

  // Pre-allocate the result.
  const rho: Complex[][] = new Array(dimK);
  for (let a = 0; a < dimK; a++) {
    rho[a] = new Array(dimK);
    for (let b = 0; b < dimK; b++) rho[a][b] = { re: 0, im: 0 };
  }

  // Precompute the bit masks for each kept and traced qubit.
  const keptMasks = kept.map((q) => 1 << (n - 1 - q));
  const tracedMasks = traced.map((q) => 1 << (n - 1 - q));

  for (let t = 0; t < dimT || (traced.length === 0 && t === 0); t++) {
    let tBits = 0;
    for (let j = 0; j < traced.length; j++) {
      if ((t >> (traced.length - 1 - j)) & 1) tBits |= tracedMasks[j];
    }

    for (let a = 0; a < dimK; a++) {
      let aBits = tBits;
      for (let j = 0; j < k; j++) {
        if ((a >> (k - 1 - j)) & 1) aBits |= keptMasks[j];
      }
      const a_re = state[2 * aBits];
      const a_im = state[2 * aBits + 1];

      for (let b = 0; b < dimK; b++) {
        let bBits = tBits;
        for (let j = 0; j < k; j++) {
          if ((b >> (k - 1 - j)) & 1) bBits |= keptMasks[j];
        }
        const b_re = state[2 * bBits];
        const b_im = state[2 * bBits + 1];
        // ρ[a,b] += ψ_a · conj(ψ_b)
        rho[a][b].re += a_re * b_re + a_im * b_im;
        rho[a][b].im += a_im * b_re - a_re * b_im;
      }
    }
    if (traced.length === 0) break;
  }
  return rho;
}

/** Purity Tr(ρ²): 1 for pure states, < 1 for mixed. */
export function purity(rho: Complex[][]): number {
  const d = rho.length;
  let sum = 0;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      // (ρ²)_{ii} = Σ_j ρ_{ij} · ρ_{ji}. Diagonal of square: |ρ_{ij}|² of off-diagonals
      // plus on-diagonal product. The whole sum equals Σ_{i,j} ρ_{ij} ρ_{ji}, and for
      // Hermitian ρ that's Σ |ρ_{ij}|².
      sum += rho[i][j].re * rho[i][j].re + rho[i][j].im * rho[i][j].im;
    }
  }
  return sum;
}
