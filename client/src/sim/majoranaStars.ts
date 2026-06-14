/**
 * Majorana stellar representation — a pure spin-J state drawn as 2J points
 * ("stars") on the Bloch sphere. Projecting the n-qubit state onto the
 * permutation-symmetric (Dicke) subspace gives spin J = n/2 with amplitudes
 * a_k = ⟨D_k|ψ⟩ (k excitations); the Majorana polynomial
 *
 *   P(z) = Σ_{k=0}^{n} (−1)^k √(C(n,k)) a_k z^{n−k}
 *
 * has n complex roots z_i that stereographically map to sphere directions
 * (θ_i, φ_i) via z = tan(θ/2) e^{iφ}. The constellation is rotation-covariant
 * and basis-independent: |0…0⟩ collapses all stars to the north pole, GHZ
 * spreads them evenly around a ring, Dicke states stack them on a latitude.
 * A vivid, exact phase-space picture for symmetric states. n ≤ 6.
 */

export type Star = { theta: number; phi: number };
export type MajoranaResult = {
  stars: Star[];
  /** Σ|a_k|² — weight of the state in the symmetric subspace (1 if fully
   *  symmetric); the constellation represents this projected component. */
  symmetricWeight: number;
  numQubits: number;
};

type C = { re: number; im: number };
const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const cdiv = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const cabs = (a: C) => Math.hypot(a.re, a.im);

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Durand–Kerner simultaneous root finder for a monic-ish complex polynomial
 *  given by coefficients coeffs[i] = coefficient of zⁱ (ascending). */
function roots(coeffs: C[]): C[] {
  // Trim near-zero leading coefficients (roots at infinity handled by caller).
  let deg = coeffs.length - 1;
  while (deg > 0 && cabs(coeffs[deg]) < 1e-12) deg--;
  if (deg <= 0) return [];
  const lead = coeffs[deg];
  const a = coeffs.slice(0, deg + 1).map((c) => cdiv(c, lead)); // monic
  // Initial guesses on a spiral.
  let z: C[] = Array.from({ length: deg }, (_, i) => {
    const ang = (2 * Math.PI * i) / deg + 0.4;
    const r = 0.4 + 0.9 * (i + 1) / deg;
    return { re: r * Math.cos(ang), im: r * Math.sin(ang) };
  });
  const evalP = (x: C): C => {
    let acc: C = { re: 0, im: 0 };
    for (let i = a.length - 1; i >= 0; i--) acc = cadd(cmul(acc, x), a[i]);
    return acc;
  };
  for (let iter = 0; iter < 200; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < deg; i++) {
      let denom: C = { re: 1, im: 0 };
      for (let j = 0; j < deg; j++) if (j !== i) denom = cmul(denom, csub(z[i], z[j]));
      const delta = cdiv(evalP(z[i]), denom);
      z[i] = csub(z[i], delta);
      maxDelta = Math.max(maxDelta, cabs(delta));
    }
    if (maxDelta < 1e-12) break;
  }
  return z;
}

export function majoranaStars(state: Float64Array, n: number, maxQubits = 6): MajoranaResult | null {
  if (n < 1 || n > maxQubits) return null;
  const dim = 1 << n;
  // Dicke amplitudes a_k = (1/√C(n,k)) Σ_{|x|=k} ψ_x.
  const a: C[] = Array.from({ length: n + 1 }, () => ({ re: 0, im: 0 }));
  for (let x = 0; x < dim; x++) {
    let k = 0;
    for (let q = 0; q < n; q++) if ((x >> q) & 1) k++;
    a[k] = cadd(a[k], { re: state[2 * x], im: state[2 * x + 1] });
  }
  let symmetricWeight = 0;
  for (let k = 0; k <= n; k++) {
    const inv = 1 / Math.sqrt(binom(n, k));
    a[k] = { re: a[k].re * inv, im: a[k].im * inv };
    symmetricWeight += a[k].re * a[k].re + a[k].im * a[k].im;
  }

  // Polynomial coefficient of z^(n−k) is (−1)^k √C(n,k) a_k → ascending order.
  const coeffs: C[] = Array.from({ length: n + 1 }, () => ({ re: 0, im: 0 }));
  for (let k = 0; k <= n; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    const w = sign * Math.sqrt(binom(n, k));
    coeffs[n - k] = { re: a[k].re * w, im: a[k].im * w };
  }

  const finite = roots(coeffs);
  const stars: Star[] = finite.map((z) => {
    const r = cabs(z);
    const theta = 2 * Math.atan(r);
    const phi = Math.atan2(z.im, z.re);
    return { theta, phi: phi < 0 ? phi + 2 * Math.PI : phi };
  });
  // Roots at infinity (leading coefficients vanished) → stars at the south pole.
  for (let i = stars.length; i < n; i++) stars.push({ theta: Math.PI, phi: 0 });

  return { stars, symmetricWeight, numQubits: n };
}
