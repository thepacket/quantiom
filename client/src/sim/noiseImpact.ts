import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { simulateNoisy } from "./simulateNoisy";
import type { NoiseModel } from "./noise";
import { densityEigenvaluesSigned, vonNeumannEntropy } from "./entanglement";
import type { Complex } from "./density";

export type NoiseImpact = {
  numQubits: number;
  /** Fidelity F = ⟨ψ_ideal|ρ|ψ_ideal⟩ of the noisy mixed state to the
   *  noiseless pure state (1 = untouched, → small as it decoheres). */
  fidelity: number;
  /** Trace distance ½‖ρ − |ψ⟩⟨ψ|‖₁ to the ideal (0 = identical, ≤ 1). */
  traceDistance: number;
  /** Purity Tr(ρ²): 1 = pure, 1/2ⁿ = maximally mixed. */
  purity: number;
  /** Von Neumann entropy S(ρ) in bits (0 = pure, n = maximally mixed). */
  entropy: number;
};

export const MAX_NOISE_IMPACT_QUBITS = 6;

/** Interleaved-re/im row-major Float64Array → Complex[][] (dim×dim). */
function toComplexMatrix(buf: Float64Array, dim: number): Complex[][] {
  const m: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const o = 2 * (i * dim + j);
      m[i][j] = { re: buf[o], im: buf[o + 1] };
    }
  }
  return m;
}

/**
 * How much the noise model has degraded the state: fidelity and trace distance
 * to the noiseless pure state, plus purity and von Neumann entropy of the
 * trajectory-averaged ρ. Statevector/trajectory path, capped at 6 qubits.
 * Returns null when out of range or noise is disabled.
 */
export function noiseImpact(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
): NoiseImpact | null {
  const n = circuit.numQubits;
  if (n < 1 || n > MAX_NOISE_IMPACT_QUBITS || !noise.enabled) return null;
  const dim = 1 << n;

  const noisy = simulateNoisy(circuit, paramValues, customGates, noise, { density: true });
  const rhoBuf = noisy.densityMatrix;
  if (!rhoBuf) return null;

  // Ideal noiseless pure state ψ.
  const ideal = simulate(circuit, paramValues, customGates).state;

  // Fidelity F = ⟨ψ|ρ|ψ⟩ = Σ_ij ψ_i* ρ_ij ψ_j  (real for Hermitian ρ, pure ψ).
  let fRe = 0;
  for (let i = 0; i < dim; i++) {
    const ai = ideal[2 * i], bi = ideal[2 * i + 1]; // ψ_i = ai + i·bi
    for (let j = 0; j < dim; j++) {
      const o = 2 * (i * dim + j);
      const rr = rhoBuf[o], ri = rhoBuf[o + 1];
      const aj = ideal[2 * j], bj = ideal[2 * j + 1]; // ψ_j = aj + i·bj
      // ψ_i* · ρ_ij · ψ_j ; accumulate real part.
      // ψ_i* = ai − i·bi. (ai−i bi)(rr+i ri)(aj+i bj)
      const m1Re = ai * rr + bi * ri;   // ψ_i* · ρ_ij, real
      const m1Im = ai * ri - bi * rr;   // imag
      fRe += m1Re * aj - m1Im * bj;
    }
  }
  const fidelity = Math.max(0, Math.min(1, fRe));

  // Purity Tr(ρ²) = Σ_ij |ρ_ij|².
  let purity = 0;
  for (let k = 0; k < dim * dim; k++) {
    const rr = rhoBuf[2 * k], ri = rhoBuf[2 * k + 1];
    purity += rr * rr + ri * ri;
  }

  const rho = toComplexMatrix(rhoBuf, dim);
  const entropy = vonNeumannEntropy(rho);

  // Trace distance ½ Σ|λ| of the Hermitian difference D = ρ − |ψ⟩⟨ψ|.
  const diff: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
  for (let i = 0; i < dim; i++) {
    const ai = ideal[2 * i], bi = ideal[2 * i + 1];
    for (let j = 0; j < dim; j++) {
      const aj = ideal[2 * j], bj = ideal[2 * j + 1];
      // (|ψ⟩⟨ψ|)_ij = ψ_i ψ_j* = (ai+i bi)(aj−i bj)
      const pRe = ai * aj + bi * bj;
      const pIm = bi * aj - ai * bj;
      diff[i][j] = { re: rho[i][j].re - pRe, im: rho[i][j].im - pIm };
    }
  }
  const eig = densityEigenvaluesSigned(diff);
  let traceDistance = 0;
  for (const l of eig) traceDistance += Math.abs(l);
  traceDistance *= 0.5;

  return { numQubits: n, fidelity, traceDistance, purity, entropy };
}
