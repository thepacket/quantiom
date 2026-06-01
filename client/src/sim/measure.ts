import { applyKQubit } from "./apply";
import { M_H, M_S, M_Sdg, M_X } from "./matrices";

/**
 * Measurement primitives for the statevector simulator. One trajectory
 * per call — sample an outcome from the qubit's marginal distribution,
 * project the global state onto the corresponding subspace, and
 * renormalise. Returns the classical outcome (0 or 1).
 *
 * Used by `simulate()` when a measure / reset gate is encountered, and
 * by `simulateNoisy()` per-trajectory.
 */

export function measureZ(state: Float64Array, n: number, q: number, rng: () => number): number {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  let p1 = 0;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) !== 0) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      p1 += re * re + im * im;
    }
  }
  // Numerical safety: clamp to [0, 1].
  const p1c = Math.max(0, Math.min(1, p1));
  const outcome = rng() < p1c ? 1 : 0;
  projectQubit(state, n, q, outcome);
  return outcome;
}

export function measureX(state: Float64Array, n: number, q: number, rng: () => number): number {
  // Rotate into Z basis, measure, rotate back.
  applyKQubit(state, n, [q], M_H);
  const o = measureZ(state, n, q, rng);
  applyKQubit(state, n, [q], M_H);
  return o;
}

export function measureY(state: Float64Array, n: number, q: number, rng: () => number): number {
  applyKQubit(state, n, [q], M_Sdg);
  applyKQubit(state, n, [q], M_H);
  const o = measureZ(state, n, q, rng);
  applyKQubit(state, n, [q], M_H);
  applyKQubit(state, n, [q], M_S);
  return o;
}

/** Reset to |0⟩ — equivalent to a Z-measurement followed by an X if the
 *  outcome was 1. Doesn't record the outcome to a classical bit. */
export function reset(state: Float64Array, n: number, q: number, rng: () => number): void {
  const outcome = measureZ(state, n, q, rng);
  if (outcome === 1) applyKQubit(state, n, [q], M_X);
}

/** Project the state onto the subspace where qubit q has value `outcome`,
 *  renormalising the surviving amplitudes. */
function projectQubit(state: Float64Array, n: number, q: number, outcome: number): void {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  const wantMask = outcome === 1 ? mask : 0;
  let norm2 = 0;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) === wantMask) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      norm2 += re * re + im * im;
    } else {
      state[2 * i] = 0;
      state[2 * i + 1] = 0;
    }
  }
  const norm = Math.sqrt(norm2);
  if (norm > 1e-12) {
    const inv = 1 / norm;
    for (let i = 0; i < dim; i++) {
      if ((i & mask) === wantMask) {
        state[2 * i] *= inv;
        state[2 * i + 1] *= inv;
      }
    }
  }
}

// ─── Deterministic seeding ────────────────────────────────────────────

/** Mulberry32 — small, fast, fine for a Quantiom-grade simulator. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit unsigned int (FNV-1a). Used to seed the RNG
 *  deterministically from the circuit + parameters so that re-renders give
 *  the same measurement trajectory until the user changes something. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
