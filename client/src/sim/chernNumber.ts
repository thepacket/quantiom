/**
 * Chern number of the prepared state over the 2-torus of two free symbols.
 * Discretising the parameter torus [0, 2π)² into an N×N grid, the gauge-
 * invariant Fukui–Hatsugai–Suzuki construction builds link variables
 * U_μ(k) = ⟨ψ(k)|ψ(k+μ̂)⟩ / |·| and the Berry flux through each plaquette
 *
 *   F(k) = arg[ U₁(k) · U₂(k+1̂) · U₁(k+2̂)* · U₂(k)* ]  ∈ (−π, π],
 *
 * whose sum gives the **quantized** Chern number C = (1/2π) Σ_k F(k). C is a
 * topological invariant (an integer up to discretisation): a non-zero value
 * signals a topologically non-trivial parameter dependence. The plaquette flux
 * is drawn as a Berry-curvature heatmap. Needs ≥ 2 free symbols; statevector
 * path. Complements the single-loop Berry-phase panel (this tiles the whole
 * torus) and the local Berry curvature in the QGT panel (this integrates it).
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type ChernResult = {
  symbols: [string, string];
  /** Berry flux per plaquette, N×N. */
  curvature: number[][];
  /** Chern number C = (1/2π) Σ F (≈ integer). */
  chern: number;
  grid: number;
};

/** ⟨a|b⟩ of two interleaved-re/im statevectors. */
function inner(a: Float64Array, b: Float64Array): [number, number] {
  let re = 0, im = 0;
  const dim = a.length / 2;
  for (let i = 0; i < dim; i++) {
    const ar = a[2 * i], ai = a[2 * i + 1];
    const br = b[2 * i], bi = b[2 * i + 1];
    re += ar * br + ai * bi; // conj(a)·b
    im += ar * bi - ai * br;
  }
  return [re, im];
}

export function chernNumber(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  sym0: string,
  sym1: string,
  grid = 12,
  maxQubits = 12,
): ChernResult | null {
  if (sym0 === sym1) return null;
  const n = circuit.numQubits;
  if (n < 1 || n > maxQubits) return null;

  // States on the periodic grid (k = 0 … grid−1 maps to θ = 2πk/grid).
  const states: Float64Array[][] = Array.from({ length: grid }, () => new Array<Float64Array>(grid));
  for (let i = 0; i < grid; i++) {
    const t0 = (2 * Math.PI * i) / grid;
    for (let j = 0; j < grid; j++) {
      const t1 = (2 * Math.PI * j) / grid;
      states[i][j] = simulate(circuit, { ...paramValues, [sym0]: t0, [sym1]: t1 }, customGates).state;
    }
  }

  const link = (a: Float64Array, b: Float64Array): [number, number] => {
    const [re, im] = inner(a, b);
    const mag = Math.hypot(re, im) || 1;
    return [re / mag, im / mag];
  };
  const cmul = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] * b[0] - a[1] * b[1],
    a[0] * b[1] + a[1] * b[0],
  ];
  const conj = (a: [number, number]): [number, number] => [a[0], -a[1]];

  const curvature: number[][] = Array.from({ length: grid }, () => new Array<number>(grid).fill(0));
  let chern = 0;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const ip = (i + 1) % grid, jp = (j + 1) % grid;
      const U1 = link(states[i][j], states[ip][j]);
      const U2ip = link(states[ip][j], states[ip][jp]);
      const U1jp = link(states[i][jp], states[ip][jp]);
      const U2 = link(states[i][j], states[i][jp]);
      // F = arg(U1 · U2(i+1) · U1(j+1)* · U2*)
      let prod = cmul(U1, U2ip);
      prod = cmul(prod, conj(U1jp));
      prod = cmul(prod, conj(U2));
      const F = Math.atan2(prod[1], prod[0]);
      curvature[i][j] = F;
      chern += F;
    }
  }
  chern /= 2 * Math.PI;
  return { symbols: [sym0, sym1], curvature, chern, grid };
}
