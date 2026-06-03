/**
 * Spin (atomic) coherent-state Husimi Q-function on the Bloch sphere.
 *
 * There are no bosonic modes in a qubit simulator, so the right analogue of
 * the optical Husimi-Q is the *spin* coherent-state version: with the
 * SU(2) / atomic coherent state |θ,φ⟩ = (cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩)^⊗n
 * pointing in direction (θ,φ),
 *
 *   Q(θ,φ) = |⟨θ,φ|ψ⟩|²
 *
 * is a smooth, **everywhere non-negative** quasi-probability over the
 * sphere — the always-positive complement to the discrete Wigner function
 * (which can go negative). It shows where the collective spin "points" and
 * how it's spread: a single coherent lobe for a product state, two
 * antipodal lobes for a GHZ "cat", an equatorial band that pinches for a
 * spin-squeezed state. Most physical for permutation-symmetric states
 * (Dicke, GHZ, spin-squeezed); for a general state it is still the valid
 * projection onto product coherent directions.
 *
 * Cost: one O(n·2ⁿ) coherent-state overlap per (θ,φ) grid point.
 */

export type HusimiResult = {
  /** Q[i][j] over a (θ, φ) grid; rows = θ ∈ [0, π], cols = φ ∈ [0, 2π). */
  Q: number[][];
  nTheta: number;
  nPhi: number;
  max: number;
  numQubits: number;
};

export function husimiQ(
  state: Float64Array,
  n: number,
  nTheta = 33,
  nPhi = 64,
  maxQubits = 7,
): HusimiResult | null {
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  const Q: number[][] = Array.from({ length: nTheta }, () => new Array<number>(nPhi).fill(0));
  let max = 0;

  // Per-qubit conjugate coherent amplitudes: conj(a0)=cos(θ/2) (real),
  // conj(a1)=sin(θ/2)·e^{−iφ}. Overlap = Σ_x [Π_q conj(amp(x_q))] · ψ_x.
  for (let it = 0; it < nTheta; it++) {
    const theta = (Math.PI * it) / (nTheta - 1);
    const c = Math.cos(theta / 2);
    const s = Math.sin(theta / 2);
    for (let ip = 0; ip < nPhi; ip++) {
      const phi = (2 * Math.PI * ip) / nPhi;
      const a1r = s * Math.cos(phi);   // Re conj(a1) = s·cos φ
      const a1i = -s * Math.sin(phi);  // Im conj(a1) = −s·sin φ
      let ovRe = 0, ovIm = 0;
      for (let x = 0; x < dim; x++) {
        // Π_q conj(amp(bit q)) for basis index x (big-endian).
        let pr = 1, pi = 0;
        for (let q = 0; q < n; q++) {
          const bit = (x >> (n - 1 - q)) & 1;
          if (bit === 0) {
            pr *= c; pi *= c;
          } else {
            const nr = pr * a1r - pi * a1i;
            const ni = pr * a1i + pi * a1r;
            pr = nr; pi = ni;
          }
        }
        const psr = state[2 * x], psi = state[2 * x + 1];
        ovRe += pr * psr - pi * psi;
        ovIm += pr * psi + pi * psr;
      }
      const q = ovRe * ovRe + ovIm * ovIm;
      Q[it][ip] = q;
      if (q > max) max = q;
    }
  }
  return { Q, nTheta, nPhi, max, numQubits: n };
}
