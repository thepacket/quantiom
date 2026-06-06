/**
 * Quantum geometric tensor (QGT) of a parameterised circuit at the current
 * point in parameter space.
 *
 *   Q_ij = ⟨∂_i ψ | ∂_j ψ⟩ − ⟨∂_i ψ | ψ⟩⟨ψ | ∂_j ψ⟩
 *
 * Its real part is the **Fubini–Study metric** g_ij = Re Q_ij — the
 * Riemannian metric on projective Hilbert space that the quantum natural
 * gradient (already wired into the optimiser) descends along; the metric
 * volume √det g is the local density of distinguishable states. Its imaginary
 * part is the **Berry curvature** F_ij = −2 Im Q_ij — the geometric-phase
 * 2-form, non-zero only where the state's parameter dependence is genuinely
 * complex. 4 g_ij equals the multi-parameter quantum Fisher information.
 *
 * Computed by central finite differences of the statevector w.r.t. each free
 * symbol: O((2k+1) · 2ⁿ) simulations for k symbols. Capped for small k.
 */

import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";

export type QgtResult = {
  symbols: string[];
  /** Fubini–Study metric g_ij = Re Q_ij (real, symmetric, PSD). */
  metric: number[][];
  /** Berry curvature F_ij = −2 Im Q_ij (real, antisymmetric). */
  berry: number[][];
  /** Eigenvalues of the metric (sorted ascending) — the principal sensitivities. */
  metricEigenvalues: number[];
  /** det(metric) — the squared local state-space volume element. */
  metricDet: number;
};

export const MAX_QGT_QUBITS = 12;
export const MAX_QGT_SYMBOLS = 8;

function innerProduct(a: Float64Array, b: Float64Array, dim: number): [number, number] {
  let re = 0, im = 0;
  for (let i = 0; i < dim; i++) {
    const aRe = a[2 * i], aIm = a[2 * i + 1];
    const bRe = b[2 * i], bIm = b[2 * i + 1];
    re += aRe * bRe + aIm * bIm; // Re conj(a)·b
    im += aRe * bIm - aIm * bRe; // Im conj(a)·b
  }
  return [re, im];
}

/** Symmetric-matrix eigenvalues via cyclic Jacobi (small k). */
function symEigenvalues(Min: number[][]): number[] {
  const k = Min.length;
  if (k === 0) return [];
  if (k === 1) return [Min[0][0]];
  const A = Min.map((r) => [...r]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < k; p++) for (let q = p + 1; q < k; q++) off += A[p][q] * A[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < k; p++) {
      for (let q = p + 1; q < k; q++) {
        if (Math.abs(A[p][q]) < 1e-15) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < k; i++) {
          const aip = A[i][p], aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < k; i++) {
          const api = A[p][i], aqi = A[q][i];
          A[p][i] = c * api - s * aqi;
          A[q][i] = s * api + c * aqi;
        }
      }
    }
  }
  return Array.from({ length: k }, (_, i) => A[i][i]).sort((a, b) => a - b);
}

function determinant(Min: number[][]): number {
  const k = Min.length;
  if (k === 0) return 1;
  const A = Min.map((r) => [...r]);
  let det = 1;
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-14) return 0;
    if (piv !== i) { [A[i], A[piv]] = [A[piv], A[i]]; det = -det; }
    det *= A[i][i];
    for (let r = i + 1; r < k; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < k; c++) A[r][c] -= f * A[i][c];
    }
  }
  return det;
}

export function quantumGeometricTensor(
  circuit: Circuit,
  customGates: CustomGate[],
  params: ParameterValues,
  symbols: string[],
  epsilon = 1e-4,
): QgtResult | null {
  const n = circuit.numQubits;
  const k = symbols.length;
  if (n < 1 || n > MAX_QGT_QUBITS || k < 1 || k > MAX_QGT_SYMBOLS) return null;

  const base = simulate(circuit, params, customGates);
  if (base.isStabilizer) return null;
  const dim = 1 << n;
  const psi = base.state;

  const dpsi: Float64Array[] = [];
  const work = { ...params };
  for (let i = 0; i < k; i++) {
    const sym = symbols[i];
    const original = work[sym] ?? 0;
    work[sym] = original + epsilon;
    const plus = simulate(circuit, work, customGates).state;
    work[sym] = original - epsilon;
    const minus = simulate(circuit, work, customGates).state;
    work[sym] = original;
    const d = new Float64Array(2 * dim);
    for (let j = 0; j < 2 * dim; j++) d[j] = (plus[j] - minus[j]) / (2 * epsilon);
    dpsi.push(d);
  }

  const psiDotD = dpsi.map((d) => innerProduct(psi, d, dim)); // ⟨ψ|∂_i ψ⟩
  const metric: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const berry: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const [aRe, aIm] = innerProduct(dpsi[i], dpsi[j], dim); // ⟨∂_i ψ|∂_j ψ⟩
      // ⟨∂_i ψ|ψ⟩⟨ψ|∂_j ψ⟩ = conj(psiDotD[i]) · psiDotD[j]
      const di = psiDotD[i], dj = psiDotD[j];
      const subRe = di[0] * dj[0] + di[1] * dj[1];
      const subIm = di[0] * dj[1] - di[1] * dj[0];
      metric[i][j] = aRe - subRe;        // Re Q_ij
      berry[i][j] = -2 * (aIm - subIm);  // −2 Im Q_ij
    }
  }

  return {
    symbols,
    metric,
    berry,
    metricEigenvalues: symEigenvalues(metric),
    metricDet: determinant(metric),
  };
}
