/**
 * Eigenstate-thermalization off-diagonal matrix elements. The ETH ansatz
 * writes an observable's matrix elements in the energy eigenbasis as
 *
 *   ⟨E_m|O|E_n⟩ = O(Ē) δ_{mn} + e^{−S(Ē)/2} f(Ē, ω) R_{mn},   ω = E_m − E_n,
 *
 * with R_{mn} pseudo-random. This panel scatters |⟨E_m|O|E_n⟩|² against the
 * energy difference ω for every off-diagonal pair: a thermalising system
 * shows a smooth, ω-dependent envelope of small elements (no structure beyond
 * f(ω)), while an integrable / many-body-localized system shows sparse, large,
 * structured elements. The diagonal elements ⟨E_n|O|E_n⟩ vs E (the
 * microcanonical curve) are overlaid. Complements the diagonal-ensemble and
 * effective-temperature panels (which only see the diagonal). Builds the dense
 * H + observable, capped at a small n, run on demand.
 */

import type { Complex } from "./density";
import { pauliSparse } from "./pauliMatrix";
import { hermitianEig } from "./eig";
import type { PauliTerm } from "./trotter";

export type EthResult = {
  /** Off-diagonal points: ω = E_m − E_n and |⟨E_m|O|E_n⟩|². */
  offDiag: { omega: number; mag2: number }[];
  /** Diagonal points: E_n and ⟨E_n|O|E_n⟩. */
  diag: { energy: number; value: number }[];
  /** Mean |O_mn|² over off-diagonal pairs (the ETH "noise floor"). */
  meanOffDiag: number;
};

export function ethOffDiagonal(
  hTerms: PauliTerm[],
  oTerms: PauliTerm[],
  n: number,
  maxQubits = 5,
  maxPoints = 4000,
): EthResult | null {
  if (n < 1 || n > maxQubits || hTerms.length === 0 || oTerms.length === 0) return null;
  const dim = 1 << n;

  // Dense Hermitian H.
  const H: Complex[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => ({ re: 0, im: 0 })),
  );
  for (const term of hTerms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    for (let c = 0; c < dim; c++) {
      H[perm[c]][c].re += term.coefficient * phRe[c];
      H[perm[c]][c].im += term.coefficient * phIm[c];
    }
  }
  const { values: E, vectors } = hermitianEig(H);

  // Apply O to each eigenvector: Ov_n.
  const Ov: Complex[][] = vectors.map((v) => applyPauliSum(oTerms, n, v));

  const offDiag: { omega: number; mag2: number }[] = [];
  const diag: { energy: number; value: number }[] = [];
  let sum = 0;
  let cnt = 0;
  // Decimate to keep the scatter plottable on large dim.
  const stride = Math.max(1, Math.floor((dim * dim) / maxPoints));
  let seen = 0;
  for (let m = 0; m < dim; m++) {
    // diagonal ⟨E_m|O|E_m⟩ (real).
    let dRe = 0;
    for (let i = 0; i < dim; i++) dRe += vectors[m][i].re * Ov[m][i].re + vectors[m][i].im * Ov[m][i].im;
    diag.push({ energy: E[m], value: dRe });
    for (let nn = 0; nn < dim; nn++) {
      if (nn === m) continue;
      let re = 0, im = 0;
      for (let i = 0; i < dim; i++) {
        // ⟨E_m|O|E_n⟩ = Σ_i conj(v_m[i]) (O v_n)[i]
        const vr = vectors[m][i].re, vi = vectors[m][i].im;
        const or = Ov[nn][i].re, oi = Ov[nn][i].im;
        re += vr * or + vi * oi;
        im += vr * oi - vi * or;
      }
      const mag2 = re * re + im * im;
      sum += mag2;
      cnt++;
      if (seen++ % stride === 0) offDiag.push({ omega: E[m] - E[nn], mag2 });
    }
  }
  return { offDiag, diag, meanOffDiag: cnt > 0 ? sum / cnt : 0 };
}

/** Apply a Pauli-sum operator to a complex vector. */
function applyPauliSum(terms: PauliTerm[], n: number, v: Complex[]): Complex[] {
  const dim = v.length;
  const out: Complex[] = Array.from({ length: dim }, () => ({ re: 0, im: 0 }));
  for (const term of terms) {
    if (term.coefficient === 0) continue;
    const { perm, phRe, phIm } = pauliSparse(n, term.paulis);
    const h = term.coefficient;
    for (let c = 0; c < dim; c++) {
      const vr = v[c].re, vi = v[c].im;
      const ar = phRe[c] * vr - phIm[c] * vi;
      const ai = phRe[c] * vi + phIm[c] * vr;
      out[perm[c]].re += h * ar;
      out[perm[c]].im += h * ai;
    }
  }
  return out;
}
