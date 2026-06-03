/**
 * Two-point connected ZZ correlations of a pure state:
 *
 *   C(i,j) = ⟨Z_i Z_j⟩ − ⟨Z_i⟩⟨Z_j⟩
 *
 * The connected correlator strips the trivial product of local
 * magnetisations and leaves the genuine correlation — positive (spins
 * aligned), negative (anti-aligned), or zero (uncorrelated). It's the
 * standard diagnostic for ordering and correlation length in spin chains,
 * and complements the mutual-information map: MI captures *total*
 * (incl. quantum) correlation, while C(i,j) is the signed classical
 * Z-basis correlation.
 *
 * Diagonal C(i,i) = 1 − ⟨Z_i⟩² is the local Z variance.
 */

export type ZZResult = {
  /** Connected correlator C(i,j), symmetric; diagonal = local variance. */
  conn: number[][];
  /** Per-qubit ⟨Z_i⟩. */
  z: number[];
};

export function zzCorrelations(state: Float64Array, n: number, maxQubits = 16): ZZResult | null {
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;

  const z = new Array<number>(n).fill(0);        // ⟨Z_i⟩
  const zz: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0)); // ⟨Z_i Z_j⟩

  for (let idx = 0; idx < dim; idx++) {
    const p = state[2 * idx] * state[2 * idx] + state[2 * idx + 1] * state[2 * idx + 1];
    if (p < 1e-15) continue;
    // Z eigenvalue per qubit: bit 0 → +1, bit 1 → −1. Big-endian: qubit q
    // is bit (n-1-q).
    let signs = 0; // store +1/−1 per qubit
    const sgn = new Int8Array(n);
    for (let q = 0; q < n; q++) {
      const bit = (idx >> (n - 1 - q)) & 1;
      sgn[q] = bit ? -1 : 1;
      z[q] += sgn[q] * p;
      void signs;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        zz[i][j] += sgn[i] * sgn[j] * p;
      }
    }
  }

  const conn: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = zz[i][j] - z[i] * z[j];
      conn[i][j] = c;
      conn[j][i] = c;
    }
  }
  return { conn, z };
}
