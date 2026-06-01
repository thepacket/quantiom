import type { Circuit } from "../editor/types";
import { buildMatrix, M_X, M_Y, M_Z, type Matrix } from "./matrices";
import { applyKQubit } from "./apply";
import { compileExpr } from "./expr";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import { paulis as evalPaulis, type Pauli } from "./expectation";
import { rateFor, type NoiseModel } from "./noise";
import { measureX, measureY, measureZ, reset as resetQubit } from "./measure";
import {
  MAX_QUBITS,
  type Amplitude,
  type BlochVector,
  type ParameterValues,
  type SimResult,
  type SkippedGate,
} from "./simulate";

/**
 * Run the circuit under a noise model, averaging derived quantities over
 * `noise.trajectories` independent runs. Each run applies the same unitary
 * sequence as the noise-free simulator, but inserts a stochastic Pauli
 * channel after every gate based on the number of qubits the gate touched.
 *
 * Returns the same shape as `simulate()` so the panels read it the same way.
 * Fields that are ill-defined in a mixed state (raw `state`, individual
 * `amplitudes`) are set to a single representative trajectory; the
 * statevector panel detects `isNoisy` and shows a notice instead.
 */
export function simulateNoisy(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
): SimResult {
  const n = circuit.numQubits;
  if (n <= 0) throw new Error("numQubits must be ≥ 1");
  if (n > MAX_QUBITS) throw new Error(`max ${MAX_QUBITS} qubits (got ${n})`);

  const dim = 1 << n;
  const T = Math.max(1, noise.trajectories | 0);

  // Accumulators for averaged quantities.
  const probsSum = new Float64Array(dim);
  const blochSum = new Float64Array(n * 3); // x0,y0,z0,x1,y1,z1,...

  // Inline-expand custom-gate references once.
  const expanded = expandCustomGates(circuit.gates, customGates);
  const gates = [...expanded].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );

  // Pre-evaluate parameter expressions once — they don't depend on the
  // trajectory, so we save the JIT cost across T runs.
  const gateMatrices: ({ U: Matrix; qubits: number[]; nQubits: number; antiQubits: number[] } | null)[] = [];
  for (const g of gates) {
    if (MARKERS.has(g.gateId) || NON_UNITARY.has(g.gateId) || CONTROL_FLOW.has(g.gateId) || g.gateId in PREP_AMPS || g.gateId === "initialize") {
      gateMatrices.push(null);
      continue;
    }
    const params = g.params.map((p) => evalParam(p, paramValues));
    const nControls = g.controls.length;
    const U = buildMatrix(g.gateId, params, nControls);
    if (!U) { gateMatrices.push(null); continue; }
    const allQubits = [...g.controls, ...g.targets];
    const antiQubits: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antiQubits.push(g.controls[i]);
      }
    }
    gateMatrices.push({ U, qubits: allQubits, nQubits: allQubits.length, antiQubits });
  }

  // Re-usable last-trajectory state for the "representative" SimResult fields.
  let lastState: Float64Array | null = null;
  const skipped: SkippedGate[] = [];
  const skippedSeen = new Set<string>();

  // Per-trajectory classical register for mid-circuit measurement + condition.
  const numClbits = Math.max(1, circuit.numClbits);
  const cReg = new Uint8Array(numClbits);

  for (let t = 0; t < T; t++) {
    const state = new Float64Array(2 * dim);
    state[0] = 1;
    cReg.fill(0);

    for (let gi = 0; gi < gates.length; gi++) {
      const g = gates[gi];
      const m = gateMatrices[gi];

      // Classical condition: skip when clbit doesn't match.
      if (g.condition && cReg[g.condition.clbit] !== g.condition.value) continue;

      // Measurement / reset — sample per trajectory.
      if (g.gateId === "measure") { cReg[g.clbits[0]] = measureZ(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "measure_x") { cReg[g.clbits[0]] = measureX(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "measure_y") { cReg[g.clbits[0]] = measureY(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "reset") { resetQubit(state, n, g.targets[0], Math.random); continue; }

      if (!m) {
        // Skipped gate — only record the first time across all trajectories.
        if (!skippedSeen.has(g.id)) {
          skippedSeen.add(g.id);
          let reason = "gate not yet implemented";
          if (CONTROL_FLOW.has(g.gateId)) reason = "control flow not simulated";
          else if (MARKERS.has(g.gateId)) reason = "marker";
          skipped.push({ id: g.id, gateId: g.gateId, reason });
        }
        // State-prep on first trajectory only — apply to this trajectory too.
        if (g.gateId in PREP_AMPS) {
          applyPrep(state, n, g.targets[0], PREP_AMPS[g.gateId]);
        }
        continue;
      }
      // Apply the gate, bracketed by X-flips for anti-controls.
      for (const q of m.antiQubits) applyKQubit(state, n, [q], M_X);
      applyKQubit(state, n, m.qubits, m.U);
      for (const q of m.antiQubits) applyKQubit(state, n, [q], M_X);

      // Inject noise. Single-qubit gates → 1q depolarising + damping on
      // target. Two-qubit gates → 2q depolarising on the pair + damping
      // per qubit. Larger → 1q depolarising at the 2q rate + damping per
      // qubit (see noise.ts docstring). Depolarising uses per-qubit rates
      // when available; damping always uses per-qubit (T1/T2 are physical).
      const involved = m.qubits;
      if (involved.length === 1) {
        const q = involved[0];
        depolarise1(state, n, q, rateFor(noise, "oneQubitDepolarising", q));
        damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
      } else if (involved.length === 2) {
        depolarise2(state, n, involved[0], involved[1], noise.twoQubitDepolarising);
        for (const q of involved) {
          damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
        }
      } else {
        for (const q of involved) {
          depolarise1(state, n, q, noise.twoQubitDepolarising);
          damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
        }
      }
    }

    // Accumulate this trajectory's probabilities and Bloch.
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      probsSum[i] += re * re + im * im;
    }
    accumulateBloch(state, n, blochSum);

    if (t === T - 1) lastState = state;
  }

  const probabilities = new Array<number>(dim);
  for (let i = 0; i < dim; i++) probabilities[i] = probsSum[i] / T;

  const blochVectors: BlochVector[] = new Array(n);
  for (let q = 0; q < n; q++) {
    blochVectors[q] = {
      x: blochSum[3 * q] / T,
      y: blochSum[3 * q + 1] / T,
      z: blochSum[3 * q + 2] / T,
    };
  }

  // The "state" and "amplitudes" fields are ill-defined for mixed states;
  // we expose the last trajectory as a representative so existing typings
  // hold. The Statevector panel detects `isNoisy` and shows a notice.
  const repState = lastState ?? new Float64Array(2 * dim);
  if (!lastState) repState[0] = 1;
  const amplitudes: Amplitude[] = new Array(dim);
  for (let i = 0; i < dim; i++) {
    const re = repState[2 * i];
    const im = repState[2 * i + 1];
    amplitudes[i] = {
      basis: i.toString(2).padStart(n, "0"),
      index: i,
      re,
      im,
      isZero: Math.abs(re) < 1e-12 && Math.abs(im) < 1e-12,
    };
  }

  const freeSymbols = collectFreeSymbols(circuit);

  return {
    numQubits: n,
    state: repState,
    amplitudes,
    probabilities,
    blochVectors,
    freeSymbols,
    skipped,
    isNoisy: true,
    trajectories: T,
  };
}

// ─── Internal: depolarising channels (stochastic Pauli) ─────────────────

function depolarise1(state: Float64Array, n: number, q: number, p: number): void {
  if (p <= 0) return;
  const r = Math.random();
  if (r < 1 - p) return;
  // Branch among X, Y, Z uniformly within the residual probability mass.
  const which = (r - (1 - p)) / p; // ∈ [0, 1)
  if (which < 1 / 3) applyKQubit(state, n, [q], M_X);
  else if (which < 2 / 3) applyKQubit(state, n, [q], M_Y);
  else applyKQubit(state, n, [q], M_Z);
}

function depolarise2(
  state: Float64Array,
  n: number,
  q0: number,
  q1: number,
  p: number,
): void {
  if (p <= 0) return;
  const r = Math.random();
  if (r < 1 - p) return;
  // 15 non-identity Pauli pairs (P0 ⊗ P1 with at least one ≠ I).
  // Index by enumeration: 0=(I,X) 1=(I,Y) 2=(I,Z) 3=(X,I) 4=(X,X) 5=(X,Y)
  // 6=(X,Z) 7=(Y,I) 8=(Y,X) 9=(Y,Y) 10=(Y,Z) 11=(Z,I) 12=(Z,X) 13=(Z,Y)
  // 14=(Z,Z). 0=I, 1=X, 2=Y, 3=Z on each side.
  const idx = Math.floor(((r - (1 - p)) / p) * 15);
  const pair = idx >= 15 ? 14 : idx;
  const pa = NONIDENT_PAIRS[pair][0];
  const pb = NONIDENT_PAIRS[pair][1];
  if (pa !== 0) applyKQubit(state, n, [q0], PAULI_M[pa]!);
  if (pb !== 0) applyKQubit(state, n, [q1], PAULI_M[pb]!);
}

const PAULI_M: ReadonlyArray<Matrix | null> = [null, M_X, M_Y, M_Z];

/**
 * Apply amplitude damping (T1) + phase damping (T2) channels via quantum
 * trajectories. Both share the K_0 = diag(1, √(1-γ)) attenuation; they
 * differ in the jump branch: AD K_1 = |0⟩⟨1| (decays to |0⟩); PD K_1 =
 * |1⟩⟨1| (projects onto |1⟩, killing coherence). Applied sequentially —
 * order is irrelevant to leading order in γ.
 */
function damp1(state: Float64Array, n: number, q: number, gammaAD: number, gammaPD: number): void {
  if (gammaAD > 0) dampingChannel(state, n, q, gammaAD, /*jumpToOne*/ false);
  if (gammaPD > 0) dampingChannel(state, n, q, gammaPD, /*jumpToOne*/ true);
}

function dampingChannel(
  state: Float64Array,
  n: number,
  q: number,
  gamma: number,
  jumpToOne: boolean,
): void {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  // p_excited = |⟨1|ψ_q⟩|² — needed for both branch probability and
  // post-K_0 renormalisation.
  let pExcited = 0;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) !== 0) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      pExcited += re * re + im * im;
    }
  }
  const pJump = gamma * pExcited;
  if (Math.random() < pJump) {
    if (jumpToOne) {
      // K_1 = |1⟩⟨1|: zero q=0 amplitudes.
      for (let i = 0; i < dim; i++) {
        if ((i & mask) === 0) {
          state[2 * i] = 0;
          state[2 * i + 1] = 0;
        }
      }
    } else {
      // K_1 = |0⟩⟨1|: move q=1 amplitudes to corresponding q=0 indices,
      // zero the q=1 amplitudes.
      for (let i = 0; i < dim; i++) {
        if ((i & mask) === 0) {
          const src = i | mask;
          state[2 * i] = state[2 * src];
          state[2 * i + 1] = state[2 * src + 1];
          state[2 * src] = 0;
          state[2 * src + 1] = 0;
        }
      }
    }
    const norm = Math.sqrt(pExcited);
    if (norm > 1e-12) {
      const inv = 1 / norm;
      for (let k = 0; k < 2 * dim; k++) state[k] *= inv;
    }
  } else {
    // K_0 branch: attenuate q=1 amplitudes by √(1-γ).
    const s = Math.sqrt(1 - gamma);
    for (let i = 0; i < dim; i++) {
      if ((i & mask) !== 0) {
        state[2 * i] *= s;
        state[2 * i + 1] *= s;
      }
    }
    const newNorm = Math.sqrt(1 - gamma * pExcited);
    if (newNorm > 1e-12) {
      const inv = 1 / newNorm;
      for (let k = 0; k < 2 * dim; k++) state[k] *= inv;
    }
  }
}
// 15 (P_a, P_b) pairs with (a,b) != (0,0). 0=I, 1=X, 2=Y, 3=Z.
const NONIDENT_PAIRS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: [number, number][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (a === 0 && b === 0) continue;
      out.push([a, b]);
    }
  }
  return out;
})();

// ─── Reused helpers (lifted from simulate.ts) ───────────────────────────

const NON_UNITARY = new Set(["measure", "measure_x", "measure_y", "reset"]);
const CONTROL_FLOW = new Set(["if", "switch", "while", "box"]);
const MARKERS = new Set(["barrier", "delay"]);

const PREP_AMPS: Record<string, [number, number, number, number]> = {
  init0:      [1, 0, 0, 0],
  init1:      [0, 0, 1, 0],
  initplus:   [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
  initminus:  [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
  initiplus:  [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  initiminus: [Math.SQRT1_2, 0, 0, -Math.SQRT1_2],
};

const EXPR_CACHE = new Map<string, ReturnType<typeof compileExpr>>();
function evalParam(src: string, scope: ParameterValues): number {
  let compiled = EXPR_CACHE.get(src);
  if (!compiled) {
    compiled = compileExpr(src);
    EXPR_CACHE.set(src, compiled);
  }
  return compiled.eval(scope);
}

function applyPrep(
  state: Float64Array,
  n: number,
  q: number,
  amps: [number, number, number, number],
): void {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  const [a0r, a0i, a1r, a1i] = amps;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) === 0) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      state[2 * i] = a0r * re - a0i * im;
      state[2 * i + 1] = a0r * im + a0i * re;
      const j = i | mask;
      state[2 * j] = a1r * re - a1i * im;
      state[2 * j + 1] = a1r * im + a1i * re;
    }
  }
}

function accumulateBloch(state: Float64Array, n: number, sink: Float64Array): void {
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
      if (!bi) {
        const j = i | mask;
        const re_j = state[2 * j];
        const im_j = state[2 * j + 1];
        r01re += re_i * re_j + im_i * im_j;
        r01im += re_i * im_j - im_i * re_j;
      }
    }
    sink[3 * q]     += 2 * r01re;
    sink[3 * q + 1] += -2 * r01im;
    sink[3 * q + 2] += r00 - r11;
  }
}

/**
 * Trajectory-averaged expectation value of an arbitrary n-qubit Pauli
 * observable. Runs `noise.trajectories` independent noisy trajectories,
 * evaluates ⟨ψ_t|P|ψ_t⟩ at the end of each, returns the mean. Used by the
 * Expectation panel when noise mode is on — `simulateNoisy()` itself
 * doesn't know which observable to track ahead of time, so we re-run
 * trajectories per selection. Cost ≈ one noisy simulate() call.
 *
 * Memoise on (circuit, params, noise rates, paulis) at the call site;
 * the result is stable for fixed inputs up to the Math.random() seed.
 */
export function noisyPauliExpectation(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  paulis: Pauli[],
): number {
  const n = circuit.numQubits;
  if (n <= 0) return 0;
  if (n > MAX_QUBITS) throw new Error(`max ${MAX_QUBITS} qubits (got ${n})`);
  const dim = 1 << n;
  const T = Math.max(1, noise.trajectories | 0);

  const expanded = expandCustomGates(circuit.gates, customGates);
  const gates = [...expanded].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );

  // Pre-evaluate gate matrices (the trajectory inner loop is the bottleneck).
  type Step = { U: Matrix; qubits: number[]; antiQubits: number[] } | null;
  const steps: Step[] = [];
  for (const g of gates) {
    if (MARKERS.has(g.gateId) || NON_UNITARY.has(g.gateId) || CONTROL_FLOW.has(g.gateId) || g.gateId in PREP_AMPS || g.gateId === "initialize") {
      steps.push(null);
      continue;
    }
    const params = g.params.map((p) => evalParam(p, paramValues));
    const U = buildMatrix(g.gateId, params, g.controls.length);
    if (!U) { steps.push(null); continue; }
    const qubits = [...g.controls, ...g.targets];
    const antiQubits: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antiQubits.push(g.controls[i]);
      }
    }
    steps.push({ U, qubits, antiQubits });
  }

  const cReg = new Uint8Array(Math.max(1, circuit.numClbits));
  let sum = 0;
  for (let t = 0; t < T; t++) {
    const state = new Float64Array(2 * dim);
    state[0] = 1;
    cReg.fill(0);
    for (let gi = 0; gi < gates.length; gi++) {
      const s = steps[gi];
      const g = gates[gi];
      if (g.condition && cReg[g.condition.clbit] !== g.condition.value) continue;
      if (g.gateId === "measure") { cReg[g.clbits[0]] = measureZ(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "measure_x") { cReg[g.clbits[0]] = measureX(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "measure_y") { cReg[g.clbits[0]] = measureY(state, n, g.targets[0], Math.random); continue; }
      if (g.gateId === "reset") { resetQubit(state, n, g.targets[0], Math.random); continue; }
      if (!s) {
        if (g.gateId in PREP_AMPS) applyPrep(state, n, g.targets[0], PREP_AMPS[g.gateId]);
        continue;
      }
      for (const q of s.antiQubits) applyKQubit(state, n, [q], M_X);
      applyKQubit(state, n, s.qubits, s.U);
      for (const q of s.antiQubits) applyKQubit(state, n, [q], M_X);
      const involved = s.qubits;
      if (involved.length === 1) {
        const q = involved[0];
        depolarise1(state, n, q, rateFor(noise, "oneQubitDepolarising", q));
        damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
      } else if (involved.length === 2) {
        depolarise2(state, n, involved[0], involved[1], noise.twoQubitDepolarising);
        for (const q of involved) damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
      } else {
        for (const q of involved) {
          depolarise1(state, n, q, noise.twoQubitDepolarising);
          damp1(state, n, q, rateFor(noise, "amplitudeDamping", q), rateFor(noise, "phaseDamping", q));
        }
      }
    }
    sum += evalPaulis(state, n, paulis);
  }
  return sum / T;
}

function collectFreeSymbols(circuit: Circuit): string[] {
  const seen = new Set<string>();
  for (const g of circuit.gates) {
    for (const p of g.params) {
      // Cheap regex: assume any identifier-shaped fragment we don't know is free.
      const matches = p.match(/[A-Za-zα-ωΑ-Ω]+/g);
      if (!matches) continue;
      for (const m of matches) {
        if (m === "pi" || m === "π" || m === "e" || m === "Math") continue;
        if (["sin", "cos", "tan", "sqrt", "exp", "ln", "log", "abs"].includes(m)) continue;
        seen.add(m);
      }
    }
  }
  return [...seen].sort();
}
