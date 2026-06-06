/**
 * Spectral form factor (SFF) of a Hamiltonian's eigenvalue spectrum:
 *
 *   SFF(t) = |Σ_i e^{-i E_i t}|² / D²,    D = number of levels
 *
 * the squared modulus of the spectral "partition function" continued to
 * imaginary time. Its log-log profile is the canonical quantum-chaos
 * diagnostic: a slope-down **dip** from SFF(0)=1, a linear **ramp** (the
 * random-matrix correlation signature), then a flat **plateau** at the
 * late-time average. For a non-degenerate spectrum the plateau sits at 1/D;
 * more generally at (Σ_g g²)/D² over the degeneracies g.
 *
 * Pure function of the eigenvalues — no circuit needed.
 */

export type SffResult = {
  /** Log-spaced times. */
  t: number[];
  /** SFF(t) at each time; SFF(0) = 1. */
  sff: number[];
  /** Late-time plateau: (Σ degeneracy²) / D². */
  plateau: number;
  /** Heisenberg time ≈ 2π / mean level spacing — where the ramp meets the plateau. */
  heisenbergTime: number;
};

export function spectralFormFactor(energies: number[], samples = 240): SffResult | null {
  const D = energies.length;
  if (D < 2) return null;

  const sorted = [...energies].sort((a, b) => a - b);
  const span = sorted[D - 1] - sorted[0] || 1;
  const meanSpacing = span / (D - 1);
  const tH = (2 * Math.PI) / meanSpacing;

  const tMin = tH / 1000;
  const tMax = tH * 20;
  const logMin = Math.log(tMin);
  const logMax = Math.log(tMax);

  const t: number[] = [];
  const sff: number[] = [];
  for (let k = 0; k < samples; k++) {
    const tk = Math.exp(logMin + ((logMax - logMin) * k) / (samples - 1));
    let re = 0;
    let im = 0;
    for (let i = 0; i < D; i++) {
      const phase = energies[i] * tk;
      re += Math.cos(phase);
      im -= Math.sin(phase);
    }
    t.push(tk);
    sff.push((re * re + im * im) / (D * D));
  }

  // Plateau = Σ_g (degeneracy g)² / D² (= 1/D when fully non-degenerate).
  const tol = 1e-9 * span + 1e-12;
  let degSquaredSum = 0;
  let i = 0;
  while (i < D) {
    let j = i + 1;
    while (j < D && sorted[j] - sorted[i] < tol) j++;
    const g = j - i;
    degSquaredSum += g * g;
    i = j;
  }

  return { t, sff, plateau: degSquaredSum / (D * D), heisenbergTime: tH };
}
