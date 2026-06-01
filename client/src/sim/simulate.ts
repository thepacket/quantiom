import type { Circuit, PlacedGate } from "../editor/types";
import { buildMatrix, M_X } from "./matrices";
import { applyKQubit } from "./apply";
import { compileExpr, detectFreeVars } from "./expr";

export const MAX_QUBITS = 20;

export type Amplitude = {
  basis: string;
  index: number;
  re: number;
  im: number;
  isZero: boolean;
};

export type BlochVector = { x: number; y: number; z: number };

export type SkippedGate = {
  id: string;
  gateId: string;
  reason: string;
};

export type SimResult = {
  numQubits: number;
  amplitudes: Amplitude[];
  probabilities: number[];
  blochVectors: BlochVector[];
  freeSymbols: string[];
  skipped: SkippedGate[];
};

export type ParameterValues = Record<string, number>;

const NON_UNITARY = new Set(["measure", "measure_x", "measure_y", "reset"]);
const CONTROL_FLOW = new Set(["if", "switch", "while", "box"]);
const MARKERS = new Set(["barrier", "delay"]);

// State-prep amplitudes for an isolated |0⟩ target.
const PREP_AMPS: Record<string, [number, number, number, number]> = {
  // gate_id → [re0, im0, re1, im1]
  init0:      [1, 0, 0, 0],
  init1:      [0, 0, 1, 0],
  initplus:   [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
  initminus:  [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
  initiplus:  [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  initiminus: [Math.SQRT1_2, 0, 0, -Math.SQRT1_2],
};

/**
 * Simulate the circuit and return derived numeric quantities.
 *
 * Synchronous and entirely client-side. Memory: 16 * 2^n bytes for the
 * state. n ≤ 20 keeps that under 16 MB. Time per gate is O(d · 2^n) where
 * d is the gate's dimension (2, 4, 8, …).
 */
export function simulate(circuit: Circuit, paramValues: ParameterValues): SimResult {
  const n = circuit.numQubits;
  if (n <= 0) throw new Error("numQubits must be ≥ 1");
  if (n > MAX_QUBITS) throw new Error(`max ${MAX_QUBITS} qubits (got ${n})`);

  const dim = 1 << n;
  const state = new Float64Array(2 * dim);
  state[0] = 1;

  const skipped: SkippedGate[] = [];

  const gates = [...circuit.gates].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );

  for (const g of gates) {
    if (MARKERS.has(g.gateId)) continue;
    if (NON_UNITARY.has(g.gateId)) {
      skipped.push({ id: g.id, gateId: g.gateId, reason: "non-unitary (measurement / reset)" });
      continue;
    }
    if (CONTROL_FLOW.has(g.gateId)) {
      skipped.push({ id: g.id, gateId: g.gateId, reason: "control flow not simulated" });
      continue;
    }
    if (g.gateId in PREP_AMPS) {
      if (!applyPrep(state, n, g.targets[0], PREP_AMPS[g.gateId])) {
        skipped.push({ id: g.id, gateId: g.gateId, reason: "qubit is entangled — state prep not applied" });
      }
      continue;
    }
    if (g.gateId === "initialize") {
      skipped.push({ id: g.id, gateId: g.gateId, reason: "arbitrary Initialize not supported" });
      continue;
    }

    // Evaluate symbolic parameter expressions to numbers.
    const params = g.params.map((p) => evalParam(p, paramValues));
    const nControls = g.controls.length;
    const U = buildMatrix(g.gateId, params, nControls);
    if (!U) {
      skipped.push({ id: g.id, gateId: g.gateId, reason: "gate not yet implemented" });
      continue;
    }
    const allQubits = [...g.controls, ...g.targets];
    // Anti-controls: the controlled gate fires on |0⟩ for those positions.
    // Bracket the gate with X on the anti-control qubits so the standard
    // controlled-on-|1⟩ matrix produces the same effect.
    const antiQubits: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antiQubits.push(g.controls[i]);
      }
    }
    for (const q of antiQubits) applyKQubit(state, n, [q], M_X);
    applyKQubit(state, n, allQubits, U);
    for (const q of antiQubits) applyKQubit(state, n, [q], M_X);
  }

  return {
    numQubits: n,
    amplitudes: extractAmplitudes(state, n),
    probabilities: computeProbabilities(state, dim),
    blochVectors: computeBloch(state, n),
    freeSymbols: collectFreeSymbols(circuit),
    skipped,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

const EXPR_CACHE = new Map<string, ReturnType<typeof compileExpr>>();

function evalParam(src: string, scope: ParameterValues): number {
  let compiled = EXPR_CACHE.get(src);
  if (!compiled) {
    compiled = compileExpr(src);
    EXPR_CACHE.set(src, compiled);
    if (EXPR_CACHE.size > 1024) {
      const firstKey = EXPR_CACHE.keys().next().value;
      if (firstKey !== undefined) EXPR_CACHE.delete(firstKey);
    }
  }
  return compiled.eval(scope);
}

function extractAmplitudes(state: Float64Array, n: number): Amplitude[] {
  const dim = 1 << n;
  const out: Amplitude[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    const re = state[2 * i];
    const im = state[2 * i + 1];
    out[i] = {
      basis: i.toString(2).padStart(n, "0"),
      index: i,
      re,
      im,
      isZero: Math.abs(re) < 1e-12 && Math.abs(im) < 1e-12,
    };
  }
  return out;
}

function computeProbabilities(state: Float64Array, dim: number): number[] {
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const re = state[2 * i];
    const im = state[2 * i + 1];
    out[i] = re * re + im * im;
  }
  return out;
}

/**
 * Compute the Bloch vector (⟨X⟩, ⟨Y⟩, ⟨Z⟩) for each qubit by partial trace.
 * Single-pass over the state: for each basis index, accumulate diagonal and
 * off-diagonal contributions to ρ_q for every qubit q.
 */
function computeBloch(state: Float64Array, n: number): BlochVector[] {
  const out: BlochVector[] = new Array(n);
  const dim = 1 << n;

  for (let q = 0; q < n; q++) {
    const mask = 1 << (n - 1 - q);
    let r00 = 0, r11 = 0;
    let r01re = 0, r01im = 0;
    for (let i = 0; i < dim; i++) {
      const bi = (i & mask) !== 0;
      const re_i = state[2 * i];
      const im_i = state[2 * i + 1];
      const p = re_i * re_i + im_i * im_i;
      if (bi) r11 += p; else r00 += p;
      // Off-diagonal: ρ[0,1] = Σ ⟨0,rest|ψ⟩⟨ψ|1,rest⟩ for matching "rest" bits.
      // We only need pairs where qubit q differs but other bits match.
      if (!bi) {
        const j = i | mask;
        const re_j = state[2 * j];
        const im_j = state[2 * j + 1];
        r01re += re_i * re_j + im_i * im_j;
        r01im += re_i * im_j - im_i * re_j;
      }
    }
    // ⟨X⟩ = ρ[0,1] + ρ[1,0] = 2 Re(ρ[0,1])
    // ⟨Y⟩ = i(ρ[0,1] − ρ[1,0]) = −2 Im(ρ[0,1])
    // ⟨Z⟩ = ρ[0,0] − ρ[1,1]
    out[q] = { x: 2 * r01re, y: -2 * r01im, z: r00 - r11 };
  }
  return out;
}

function applyPrep(
  state: Float64Array,
  n: number,
  q: number,
  amps: [number, number, number, number],
): boolean {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  // Verify qubit q is currently in |0⟩ (no amplitude where bit q is 1).
  for (let i = 0; i < dim; i++) {
    if ((i & mask) !== 0) {
      if (Math.abs(state[2 * i]) > 1e-12 || Math.abs(state[2 * i + 1]) > 1e-12) {
        return false; // entangled — can't apply state-prep as a unitary
      }
    }
  }
  const [a0r, a0i, a1r, a1i] = amps;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) === 0) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      // New amplitude at |…0…⟩ = a0 * old
      state[2 * i] = a0r * re - a0i * im;
      state[2 * i + 1] = a0r * im + a0i * re;
      // New amplitude at |…1…⟩ = a1 * old
      const j = i | mask;
      state[2 * j] = a1r * re - a1i * im;
      state[2 * j + 1] = a1r * im + a1i * re;
    }
  }
  return true;
}

function collectFreeSymbols(circuit: Circuit): string[] {
  const seen = new Set<string>();
  for (const g of circuit.gates) {
    for (const p of g.params) {
      for (const v of detectFreeVars(p)) seen.add(v);
    }
  }
  return [...seen].sort();
}

// Re-export so panels can keep importing from a single place.
export type { PlacedGate };
