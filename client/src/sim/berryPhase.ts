/**
 * Berry phase around a closed loop in the circuit's parameter space — the
 * geometric (Pancharatnam–Berry) phase the prepared state |ψ(θ)⟩ acquires on
 * a cyclic adiabatic-style traversal, computed gauge-invariantly via the
 * discrete Wilson loop:
 *
 *   γ = − arg Π_k ⟨ψ_k | ψ_{k+1}⟩,
 *
 * the product of overlaps around a discretised rectangular loop in the plane
 * of two chosen free symbols (centred on their current values). γ is
 * independent of the per-vertex phase convention (each ⟨ψ_k|ψ_{k+1}⟩ is
 * conjugate-symmetric to a gauge choice that cancels around the loop), so it
 * is a genuine geometric invariant — a quantized π / Zak phase signals a
 * topological winding; 0 a trivial loop. The complement to the Berry
 * *curvature* in the QGT panel (this integrates it over a finite loop).
 *
 * Cost is 4·`stepsPerSide` simulations. Statevector path only.
 */

import { simulate, type ParameterValues } from "./simulate";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

export type BerryPhaseResult = {
  symbols: [string, string];
  /** Wrapped Berry phase γ ∈ (−π, π]. */
  gamma: number;
  /** Per-segment phases arg⟨ψ_k|ψ_{k+1}⟩ around the loop. */
  segPhases: number[];
  /** |Π ⟨ψ_k|ψ_{k+1}⟩| ∈ [0,1] — 1 for a smoothly-sampled loop, drops near
   *  a degeneracy where the loop pierces a band-touching point. */
  overlapMagnitude: number;
  /** The loop's (θ0, θ1) vertices, for plotting. */
  loop: Array<[number, number]>;
};

/** Inner product ⟨a|b⟩ of two interleaved-re/im statevectors. */
function inner(a: Float64Array, b: Float64Array): [number, number] {
  let re = 0;
  let im = 0;
  const dim = a.length / 2;
  for (let i = 0; i < dim; i++) {
    const ar = a[2 * i], ai = a[2 * i + 1];
    const br = b[2 * i], bi = b[2 * i + 1];
    // conj(a)·b
    re += ar * br + ai * bi;
    im += ar * bi - ai * br;
  }
  return [re, im];
}

function wrap(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function berryPhase(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  sym0: string,
  sym1: string,
  radius = Math.PI / 2,
  stepsPerSide = 16,
): BerryPhaseResult | null {
  if (sym0 === sym1) return null;
  const c0 = paramValues[sym0] ?? 0;
  const c1 = paramValues[sym1] ?? 0;
  // Rectangular loop corners (counter-clockwise) centred at (c0, c1).
  const corners: Array<[number, number]> = [
    [c0 - radius, c1 - radius],
    [c0 + radius, c1 - radius],
    [c0 + radius, c1 + radius],
    [c0 - radius, c1 + radius],
  ];
  const loop: Array<[number, number]> = [];
  for (let side = 0; side < 4; side++) {
    const [ax, ay] = corners[side];
    const [bx, by] = corners[(side + 1) % 4];
    for (let s = 0; s < stepsPerSide; s++) {
      const f = s / stepsPerSide;
      loop.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
    }
  }

  // Statevector at each loop vertex.
  const states: Float64Array[] = loop.map(([t0, t1]) =>
    simulate(circuit, { ...paramValues, [sym0]: t0, [sym1]: t1 }, customGates).state,
  );

  let prodRe = 1;
  let prodIm = 0;
  const segPhases: number[] = [];
  for (let k = 0; k < states.length; k++) {
    const next = states[(k + 1) % states.length];
    const [re, im] = inner(states[k], next);
    segPhases.push(Math.atan2(im, re));
    // Multiply running product by (re + i·im).
    const nr = prodRe * re - prodIm * im;
    const ni = prodRe * im + prodIm * re;
    prodRe = nr;
    prodIm = ni;
  }

  const gamma = wrap(-Math.atan2(prodIm, prodRe));
  const overlapMagnitude = Math.hypot(prodRe, prodIm);
  return { symbols: [sym0, sym1], gamma, segPhases, overlapMagnitude, loop };
}
