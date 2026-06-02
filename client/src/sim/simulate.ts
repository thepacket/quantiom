import type { Circuit, PlacedGate } from "../editor/types";
import { buildMatrix, M_X } from "./matrices";
import { applyKQubit } from "./apply";
import { compileExpr, detectFreeVars } from "./expr";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import { isCliffordOnly, runClifford } from "./stabilizer";
import { fnv1a, measureX, measureY, measureZ, mulberry32, reset as resetQubit } from "./measure";

export const MAX_QUBITS = 20;
/** Above this width, Clifford-only circuits flow through the tableau sim. */
export const STABILIZER_THRESHOLD = 16;
/** Stabilizer mode soft cap (memory: 2n·(2n+1) bytes). */
export const MAX_QUBITS_STABILIZER = 1024;

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
  /** Raw state vector: Float64Array of length 2·2^n with re at even
   *  indices and im at odd. Exposed for panels that want to run their
   *  own derived computations (Pauli expectations, density matrix).
   *
   *  In noise mode this is one representative trajectory, not the true
   *  mixed state. Panels that depend on a pure state should check
   *  `isNoisy` and show a notice instead. */
  state: Float64Array;
  probabilities: number[];
  blochVectors: BlochVector[];
  freeSymbols: string[];
  skipped: SkippedGate[];
  /** True when the result was produced under a noise model — the
   *  Probabilities and Bloch fields are trajectory-averaged; the
   *  amplitudes/state are a single representative sample. */
  isNoisy?: boolean;
  /** Number of trajectories averaged. Only set when `isNoisy`. */
  trajectories?: number;
  /** Final classical-register values after any measurements. Length equals
   *  circuit.numClbits. Undefined when the circuit has no measurements. */
  measurementRecord?: number[];
  /** True when the result came from the Aaronson-Gottesman tableau path.
   *  Statevector / Probabilities / Density panels are unavailable in this
   *  mode (full state has too many basis elements); Bloch is exact. */
  isStabilizer?: boolean;
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
export type SimulateOptions = {
  /** Computational basis index to initialise the state at. Default 0
   *  (the |0…0⟩ ground state). Used by equivalence checking and other
   *  workflows that need the per-column action of the circuit's unitary. */
  startIndex?: number;
  /** Optional RNG for measurement sampling. Default: a Mulberry32 seeded
   *  deterministically from (circuit, params) so re-renders give the same
   *  trajectory. Pass Math.random for fresh shots per call. */
  rng?: () => number;
};

export function simulate(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[] = [],
  options?: SimulateOptions,
): SimResult {
  const n = circuit.numQubits;
  if (n <= 0) throw new Error("numQubits must be ≥ 1");

  // Inline-expand custom-gate references before scheduling.
  const expanded = expandCustomGates(circuit.gates, customGates);
  const gates = [...expanded].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );

  // Stabilizer fast path: when the circuit is Clifford-only and large
  // enough that the statevector would be cramped (or impossible), route to
  // the O(n²) tableau simulator. Sub-threshold Clifford circuits keep the
  // statevector path so the user still sees full amplitudes.
  if (n > STABILIZER_THRESHOLD && isCliffordOnly(gates)) {
    if (n > MAX_QUBITS_STABILIZER) {
      throw new Error(`max ${MAX_QUBITS_STABILIZER} qubits in stabilizer mode (got ${n})`);
    }
    return stabilizerResult(circuit, n, gates, paramValues);
  }

  if (n > MAX_QUBITS) throw new Error(`max ${MAX_QUBITS} qubits (got ${n})`);

  const dim = 1 << n;
  const state = new Float64Array(2 * dim);
  const startIndex = options?.startIndex ?? 0;
  if (startIndex < 0 || startIndex >= dim) {
    throw new Error(`startIndex ${startIndex} out of range [0, ${dim})`);
  }
  state[2 * startIndex] = 1;

  const skipped: SkippedGate[] = [];

  // Classical register + RNG for mid-circuit measurements. Allocated only
  // when a measurement appears in the gate list; circuits without measure/
  // reset stay on the bare hot path with zero new cost.
  const hasMeasurement = gates.some(
    (g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y" || g.gateId === "reset",
  );
  const hasConditions = gates.some((g) => g.condition !== undefined);
  let cReg: Uint8Array | null = null;
  let rng: (() => number) | null = null;
  if (hasMeasurement || hasConditions) {
    cReg = new Uint8Array(Math.max(1, circuit.numClbits));
    if (options?.rng) {
      rng = options.rng;
    } else {
      // Deterministic seed: a hash of the circuit + parameter values keeps
      // re-renders stable until the user actually changes something.
      const seedText = JSON.stringify({ g: circuit.gates, q: circuit.numQubits, p: paramValues });
      rng = mulberry32(fnv1a(seedText));
    }
  }

  for (const g of gates) {
    if (MARKERS.has(g.gateId)) continue;

    // Classical-controlled execution: skip the gate when its condition's
    // clbit doesn't match. Cheap to check; only fires when the IR contains
    // any conditions at all (otherwise the field is undefined).
    if (g.condition && cReg && cReg[g.condition.clbit] !== g.condition.value) continue;

    if (g.gateId === "measure") {
      if (cReg && rng) cReg[g.clbits[0]] = measureZ(state, n, g.targets[0], rng);
      continue;
    }
    if (g.gateId === "measure_x") {
      if (cReg && rng) cReg[g.clbits[0]] = measureX(state, n, g.targets[0], rng);
      continue;
    }
    if (g.gateId === "measure_y") {
      if (cReg && rng) cReg[g.clbits[0]] = measureY(state, n, g.targets[0], rng);
      continue;
    }
    if (g.gateId === "reset") {
      if (rng) resetQubit(state, n, g.targets[0], rng);
      continue;
    }
    if (NON_UNITARY.has(g.gateId)) {
      skipped.push({ id: g.id, gateId: g.gateId, reason: "non-unitary (not yet implemented)" });
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

  // Lazy fields. The gate-application work above is the only mandatory cost
  // per simulate() call; everything below is computed on first access and
  // memoised, so panels that are collapsed (or that simply don't read a
  // given field) pay nothing for it.
  let _amps: Amplitude[] | null = null;
  let _probs: number[] | null = null;
  let _blochs: BlochVector[] | null = null;
  const measurementRecord = cReg ? Array.from(cReg.slice(0, circuit.numClbits)) : undefined;
  return {
    numQubits: n,
    state,
    freeSymbols: collectFreeSymbols(circuit),
    skipped,
    measurementRecord,
    get amplitudes() {
      if (!_amps) _amps = extractAmplitudes(state, n);
      return _amps;
    },
    get probabilities() {
      if (!_probs) _probs = computeProbabilities(state, dim);
      return _probs;
    },
    get blochVectors() {
      if (!_blochs) _blochs = computeBloch(state, n);
      return _blochs;
    },
  };
}

// ─── Stabilizer dispatch ───────────────────────────────────────────────

function stabilizerResult(
  circuit: Circuit,
  n: number,
  gates: ReadonlyArray<PlacedGate>,
  paramValues: ParameterValues,
): SimResult {
  // Deterministic measurement outcomes per circuit + params, so re-renders
  // don't shuffle. Stabilizer measurements are otherwise truly random.
  const seedText = JSON.stringify({ g: circuit.gates, q: circuit.numQubits, p: paramValues });
  const rng = mulberry32(fnv1a(seedText));
  const { tab, classical } = runClifford(n, gates, rng, circuit.numClbits);
  let _blochs: BlochVector[] | null = null;
  const empty = new Float64Array(0);
  return {
    numQubits: n,
    state: empty,
    amplitudes: [],
    probabilities: [],
    freeSymbols: collectFreeSymbols(circuit),
    skipped: [],
    isStabilizer: true,
    measurementRecord: classical.length > 0
      ? Array.from(classical.slice(0, circuit.numClbits))
      : undefined,
    get blochVectors() {
      if (!_blochs) _blochs = tab.blochVectors();
      return _blochs;
    },
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
