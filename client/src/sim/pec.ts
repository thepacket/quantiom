import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { evalExpr } from "./expr";
import { expandCustomGates } from "../editor/customGates";
import { evaluateObservable, type Observable } from "./expectation";
import { applyKQubit } from "./apply";
import { buildMatrix, M_X, M_Y, M_Z, type Matrix } from "./matrices";
import { reset as resetTo0 } from "./measure";
import type { NoiseModel } from "./noise";

/**
 * Probabilistic Error Cancellation for Pauli noise channels.
 *
 * Channels inverted by this implementation:
 *   • Single-qubit depolarising (rate p₁)
 *   • Phase damping, treated as a Z-only Pauli channel
 *     PD(ρ) = (1 − λ/2) ρ + (λ/2) Z ρ Z. λ ≡ noise.phaseDamping per gate.
 *   • Two-qubit depolarising (rate p₂), applied after every 2-qubit gate.
 *   • Amplitude damping (rate λ) — non-Pauli quasiprobability per
 *     Endo-Benjamin-Li 2018. Decomposition uses Paulis plus the two reset
 *     channels Reset_0 (ρ ↦ Tr(ρ) |0⟩⟨0|) and Reset_1 (ρ ↦ Tr(ρ) |1⟩⟨1|).
 *     Reset_k is implemented per-trajectory as "measure Z, flip to |k⟩ if
 *     needed" — averaging over measurement outcomes reproduces the channel.
 *
 * NOT inverted yet (caller's responsibility to know the limitation):
 *   • Readout bit-flip — applies only at measurement time; PEC for it
 *     factors orthogonally and would belong in the measurement sampler.
 *   • Crosstalk — depends on coupling map; could be inverted analogously
 *     to depolarising at each spectator qubit, but rare enough we skip.
 *   • Custom Kraus channels — by definition user-defined; no inversion.
 *
 * Estimator: for each trajectory simulate the *noiseless* circuit. At
 * each gate location, sample a Pauli correction from each applicable
 * inverse-channel quasiprobability distribution, applying the sampled
 * Paulis in sequence and tracking sign · γ_total per channel. After
 * all locations, weight the observable by the product of all
 * sign·γ_totals. Average over T trajectories gives an unbiased estimate
 * of the noise-free expectation.
 *
 * Variance grows multiplicatively in the per-location γ_total^2 product;
 * variance overhead is reported so the UI can warn about high-cost regimes.
 *
 * # Pauli-channel quasiprobability math
 *
 * For a Pauli channel N(ρ) = Σ_P c_P P ρ P with sum c_P = 1, the
 * eigenvalues in the Pauli basis are
 *   λ_Q = Σ_P c_P · χ(P, Q),     χ = +1 if PQ = QP else −1
 * The inverse channel is N⁻¹(ρ) = Σ_P γ_P P ρ P with γ_P obtained by
 * inverting the eigenvalues:
 *   γ_P = (1/n_Paulis) · Σ_Q (1/λ_Q) · χ(P, Q)
 * γ_I is always positive; γ_{P≠I} are negative for any non-trivial noise.
 */

export type PecResult = {
  value: number;
  trajectories: number;
  /** Total variance overhead: Π_location (Σ |γ_a|)^2 across every channel
   *  inverted at that location. Grows exponentially in depth × #channels. */
  varianceOverhead: number;
  /** Per-channel quick summary for the UI. */
  channels: {
    /** Number of 1q gate locations where 1q-depolarising inverse fires. */
    oneQDepol: number;
    /** Number of locations (1q + 2q) where phase-damping inverse fires. */
    phaseDamping: number;
    /** Number of 2q gate locations where 2q-depolarising inverse fires. */
    twoQDepol: number;
    /** Number of locations (1q + 2q) where amplitude-damping inverse fires. */
    amplitudeDamping: number;
  };
  /** Channels NOT inverted that the noise model has enabled — surfaced so
   *  the UI can warn the user the PEC estimate is only partial. */
  uninverted: string[];
};

// ─── Pauli enums and small helpers ──────────────────────────────────────

const PAULI_MX: Record<1 | 2 | 3, Matrix> = { 1: M_X, 2: M_Y, 3: M_Z };

function applyPauli1q(state: Float64Array, n: number, q: number, pauli: 0 | 1 | 2 | 3): void {
  if (pauli === 0) return;
  applyKQubit(state, n, [q], PAULI_MX[pauli]);
}

function applyPauli2q(state: Float64Array, n: number, qA: number, qB: number, pA: 0 | 1 | 2 | 3, pB: 0 | 1 | 2 | 3): void {
  applyPauli1q(state, n, qA, pA);
  applyPauli1q(state, n, qB, pB);
}

// ─── Inverse-channel quasiprobability tables ────────────────────────────

type InverseSampler1q = {
  /** γ_I (positive). */
  gammaI: number;
  /** γ_P for non-identity Paulis (typically negative). */
  gammaP: number;
  /** Σ |γ_a|, the variance per-location scaling factor. */
  gammaTotal: number;
  /** Cumulative probabilities for I, X, Y. (pZ implicit.) */
  pI: number;
  pX: number;
  pY: number;
};

/** Build the inverse-channel sampler for a 1q depolarising channel at rate p. */
function depolarising1qInverse(p: number): InverseSampler1q {
  const pp = clamp(p, 0, 0.749);
  if (pp === 0) {
    return { gammaI: 1, gammaP: 0, gammaTotal: 1, pI: 1, pX: 1, pY: 1 };
  }
  const q = 1 / (1 - (4 * pp) / 3);
  const gammaI = (1 + 3 * q) / 4;
  const gammaP = (1 - q) / 4;
  const gammaTotal = Math.abs(gammaI) + 3 * Math.abs(gammaP);
  return {
    gammaI, gammaP, gammaTotal,
    pI: Math.abs(gammaI) / gammaTotal,
    pX: Math.abs(gammaP) / gammaTotal,
    pY: Math.abs(gammaP) / gammaTotal,
  };
}

/**
 * Phase damping is a Z-only Pauli channel:
 *   PD(ρ) = (1 − λ/2) ρ + (λ/2) Z ρ Z
 * Eigenvalues in Pauli basis: λ_I = λ_Z = 1, λ_X = λ_Y = 1 − λ. Inverse:
 *   γ_I = (1 + 1/(1−λ)) / 2
 *   γ_Z = (1 − 1/(1−λ)) / 2  (negative for λ > 0)
 *   γ_X = γ_Y = 0
 */
function phaseDampingInverse(lambda: number): InverseSampler1q {
  const l = clamp(lambda, 0, 0.999);
  if (l === 0) {
    return { gammaI: 1, gammaP: 0, gammaTotal: 1, pI: 1, pX: 1, pY: 1 };
  }
  const r = 1 / (1 - l);
  const gammaI = (1 + r) / 2;
  const gammaZ = (1 - r) / 2;
  const gammaTotal = Math.abs(gammaI) + Math.abs(gammaZ);
  // pX, pY are zero — channel only samples I and Z.
  return {
    gammaI, gammaP: gammaZ, gammaTotal,
    pI: Math.abs(gammaI) / gammaTotal,
    pX: Math.abs(gammaI) / gammaTotal,   // X never sampled (degenerate cum bound)
    pY: Math.abs(gammaI) / gammaTotal,   // Y never sampled
  };
}

// ─── Amplitude damping inverse (non-Pauli) ──────────────────────────────

/**
 * Inverse of the amplitude-damping channel AD_λ.
 *
 * Pauli-transfer matrix of AD_λ has the columns:
 *   I → I + λ Z,  X → √(1−λ) X,  Y → √(1−λ) Y,  Z → (1−λ) Z.
 *
 * Inverting gives an off-diagonal [I → −λ/(1−λ) Z] component that no
 * Pauli channel can reproduce, so we extend the basis with the two
 * reset channels Reset_k(ρ) = Tr(ρ) |k⟩⟨k|. Decomposition:
 *
 *   γ_I = 1/√(1−λ)
 *   γ_X = γ_Y = (1/√(1−λ) − 1/(1−λ)) / 2          (negative)
 *   γ_Z = 0
 *   γ_R0 = ((1/√(1−λ) − 1)² − λ/(1−λ)) / 2        (negative for λ > 0)
 *   γ_R1 = ((1/√(1−λ) − 1)² + λ/(1−λ)) / 2        (positive)
 *
 * Reset_k is implemented in the trajectory as "measure Z, flip if the
 * outcome isn't k". Averaging over measurement outcomes is the channel
 * Reset_k = Tr(ρ) |k⟩⟨k|. Coupled to the PEC weight tracking this gives
 * an unbiased estimator of the amplitude-damping-corrected expectation.
 */
type InverseSamplerAD = {
  gammaI: number;
  gammaX: number; // = gammaY
  gammaR0: number;
  gammaR1: number;
  gammaTotal: number;
  /** Cumulative probability boundaries, in order I, X, Y, R0, R1. */
  pI: number;
  pX: number;
  pY: number;
  pR0: number;
};

function amplitudeDampingInverse(lambda: number): InverseSamplerAD {
  const l = clamp(lambda, 0, 0.999);
  if (l === 0) {
    return { gammaI: 1, gammaX: 0, gammaR0: 0, gammaR1: 0, gammaTotal: 1, pI: 1, pX: 1, pY: 1, pR0: 1 };
  }
  const s = 1 / Math.sqrt(1 - l);
  const t = 1 / (1 - l);
  const gammaI = s;
  const gammaX = (s - t) / 2;            // negative
  const lt = l / (1 - l);
  const sum = (s - 1) * (s - 1);
  const gammaR0 = (sum - lt) / 2;
  const gammaR1 = (sum + lt) / 2;
  const total = Math.abs(gammaI) + 2 * Math.abs(gammaX) + Math.abs(gammaR0) + Math.abs(gammaR1);
  const pI = Math.abs(gammaI) / total;
  const pX = pI + Math.abs(gammaX) / total;
  const pY = pX + Math.abs(gammaX) / total;
  const pR0 = pY + Math.abs(gammaR0) / total;
  return { gammaI, gammaX, gammaR0, gammaR1, gammaTotal: total, pI, pX, pY, pR0 };
}

type ADAction = "I" | "X" | "Y" | "R0" | "R1";

function sampleAD(s: InverseSamplerAD): { action: ADAction; sign: 1 | -1 } {
  if (s.gammaTotal <= 1) return { action: "I", sign: 1 };
  const r = Math.random();
  let action: ADAction;
  let gamma: number;
  if (r < s.pI) { action = "I"; gamma = s.gammaI; }
  else if (r < s.pX) { action = "X"; gamma = s.gammaX; }
  else if (r < s.pY) { action = "Y"; gamma = s.gammaX; }
  else if (r < s.pR0) { action = "R0"; gamma = s.gammaR0; }
  else { action = "R1"; gamma = s.gammaR1; }
  return { action, sign: gamma >= 0 ? 1 : -1 };
}

/** Apply Reset_k on qubit q via measure-then-flip. Averaging over the
 *  RNG outcomes is exactly the channel ρ ↦ Tr(ρ) |k⟩⟨k|. */
function applyResetK(state: Float64Array, n: number, q: number, k: 0 | 1, rng: () => number): void {
  resetTo0(state, n, q, rng); // → |0⟩
  if (k === 1) applyKQubit(state, n, [q], M_X);
}

/** Sample which Pauli to apply from a 1q inverse-channel distribution. Returns
 *  the chosen Pauli (0=I, 1=X, 2=Y, 3=Z) and the sign of γ for that Pauli. */
function sample1q(s: InverseSampler1q): { pauli: 0 | 1 | 2 | 3; sign: 1 | -1 } {
  if (s.gammaTotal <= 1) return { pauli: 0, sign: 1 };
  const r = Math.random();
  let pauli: 0 | 1 | 2 | 3;
  if (r < s.pI) pauli = 0;
  else if (r < s.pX) pauli = 1;
  else if (r < s.pY) pauli = 2;
  else pauli = 3;
  const sign = pauli === 0 ? (s.gammaI >= 0 ? 1 : -1) : (s.gammaP >= 0 ? 1 : -1);
  return { pauli, sign };
}

// ─── Two-qubit depolarising ────────────────────────────────────────────

type InverseSampler2q = {
  /** γ_II (positive). */
  gammaII: number;
  /** γ_{P≠II} for any non-II Pauli pair (all 15 share the same value). */
  gammaPnontriv: number;
  gammaTotal: number;
  pII: number;
  /** Cumulative probability boundary for each non-II Pauli pair (15 equal slots). */
  pNontrivStep: number;
};

/**
 * Two-qubit depolarising inverse. N₂(ρ) = (1−p) ρ + (p/15) Σ_{P≠II} P ρ P
 *
 * Eigenvalues: λ_II = 1, λ_{P≠II} = 1 − p · 16/15. Inverse:
 *   γ_II = (1 + 15·r) / 16, γ_{P≠II} = (1 − r) / 16, with r = 1 / λ_{P≠II}.
 */
function depolarising2qInverse(p: number): InverseSampler2q {
  const pp = clamp(p, 0, 14 / 16);
  if (pp === 0) {
    return { gammaII: 1, gammaPnontriv: 0, gammaTotal: 1, pII: 1, pNontrivStep: 0 };
  }
  const r = 1 / (1 - (pp * 16) / 15);
  const gammaII = (1 + 15 * r) / 16;
  const gammaPnontriv = (1 - r) / 16;
  const gammaTotal = Math.abs(gammaII) + 15 * Math.abs(gammaPnontriv);
  return {
    gammaII, gammaPnontriv, gammaTotal,
    pII: Math.abs(gammaII) / gammaTotal,
    pNontrivStep: Math.abs(gammaPnontriv) / gammaTotal,
  };
}

function sample2q(s: InverseSampler2q): { pA: 0 | 1 | 2 | 3; pB: 0 | 1 | 2 | 3; sign: 1 | -1 } {
  if (s.gammaTotal <= 1) return { pA: 0, pB: 0, sign: 1 };
  const r = Math.random();
  if (r < s.pII) return { pA: 0, pB: 0, sign: s.gammaII >= 0 ? 1 : -1 };
  // Pick uniformly among the 15 non-II pairs.
  const r2 = (r - s.pII) / (1 - s.pII);
  const idx = Math.min(14, Math.floor(r2 * 15));
  // Map idx ∈ [0, 15) to (pA, pB) ∈ {0..3}² \ {(0,0)}.
  // Enumerate: (0,1), (0,2), (0,3), (1,0), …, (3,3).
  const flat = idx + 1; // skip (0,0)
  const pA = ((flat >> 2) & 3) as 0 | 1 | 2 | 3;
  const pB = (flat & 3) as 0 | 1 | 2 | 3;
  const sign = s.gammaPnontriv >= 0 ? 1 : -1;
  return { pA, pB, sign };
}

// ─── Main entry point ──────────────────────────────────────────────────

export function pecExpectation(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  observable: Observable,
  trajectories: number,
): PecResult {
  const n = circuit.numQubits;
  if (n === 0) {
    return {
      value: 0, trajectories, varianceOverhead: 1,
      channels: { oneQDepol: 0, phaseDamping: 0, twoQDepol: 0, amplitudeDamping: 0 },
      uninverted: [],
    };
  }

  // Quasiprobability tables. Each is identity if the underlying rate is 0,
  // so PEC is "free" for channels the user hasn't enabled.
  const samp1qDepol = depolarising1qInverse(noise.oneQubitDepolarising);
  const sampPhaseDamp = phaseDampingInverse(noise.phaseDamping);
  const samp2qDepol = depolarising2qInverse(noise.twoQubitDepolarising);
  const sampAmp = amplitudeDampingInverse(noise.amplitudeDamping);

  // Catalogue channels the user has enabled but we don't yet invert, so
  // the UI can warn that the estimate is only partial.
  const uninverted: string[] = [];
  if (noise.readoutBitFlip > 0 && hasMeasurements(circuit.gates)) uninverted.push("readout bit-flip");
  if (noise.crosstalk > 0 && noise.coupling) uninverted.push("crosstalk");
  if (noise.customKraus?.enabled) uninverted.push("custom 1q Kraus");
  if (noise.customKraus2q?.enabled) uninverted.push("custom 2q Kraus");

  const expanded = expandCustomGates(circuit.gates, customGates);
  const sorted = [...expanded].sort(
    (a, b) => a.column - b.column || a.id.localeCompare(b.id),
  );

  // Pre-build matrices and classify each step.
  type Step =
    | { kind: "1q"; U: Matrix; q: number }
    | { kind: "2q"; U: Matrix; qubits: number[]; antiQubits: number[]; involvedPair: [number, number] }
    | { kind: "multi"; U: Matrix; qubits: number[]; antiQubits: number[] }
    | { kind: "skip" };
  const steps: Step[] = sorted.map((g) => {
    if (
      g.gateId === "barrier" || g.gateId === "delay" ||
      g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box" ||
      g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y" ||
      g.gateId === "reset" || g.gateId.startsWith("init")
    ) return { kind: "skip" };
    // Evaluate symbolic parameters (π, expressions, bound free vars) the
    // same way the rest of the simulator does — parseFloat would turn
    // "pi/3" or any free symbol into NaN and poison the whole estimate.
    const params = g.params.map((expr) => evalExpr(expr, paramValues));
    const U = buildMatrix(g.gateId, params, g.controls.length);
    if (!U) return { kind: "skip" };
    const qubits = [...g.controls, ...g.targets];
    const antiQubits: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antiQubits.push(g.controls[i]);
      }
    }
    if (qubits.length === 1) return { kind: "1q", U, q: qubits[0] };
    if (qubits.length === 2) return { kind: "2q", U, qubits, antiQubits, involvedPair: [qubits[0], qubits[1]] };
    return { kind: "multi", U, qubits, antiQubits };
  });

  // Per-channel location counts (drives variance overhead reporting).
  let n1q = 0, n2q = 0;
  for (const s of steps) {
    if (s.kind === "1q") n1q++;
    else if (s.kind === "2q") n2q++;
  }
  // Phase damping fires per qubit involved in any gate; count locations
  // (i.e. one location per gate-application of damping).
  const nPhase = n1q + 2 * n2q;
  const nAmp = n1q + 2 * n2q;
  const varianceOverhead =
    Math.pow(samp1qDepol.gammaTotal, 2 * n1q) *
    Math.pow(sampPhaseDamp.gammaTotal, 2 * nPhase) *
    Math.pow(samp2qDepol.gammaTotal, 2 * n2q) *
    Math.pow(sampAmp.gammaTotal, 2 * nAmp);

  // Trajectory loop.
  const dim = 1 << n;
  let sum = 0;
  for (let t = 0; t < trajectories; t++) {
    const state = new Float64Array(2 * dim);
    state[0] = 1;
    let weight = 1;
    for (const step of steps) {
      if (step.kind === "skip") continue;
      if (step.kind === "multi") {
        for (const aq of step.antiQubits) applyKQubit(state, n, [aq], M_X);
        applyKQubit(state, n, step.qubits, step.U);
        for (const aq of step.antiQubits) applyKQubit(state, n, [aq], M_X);
        continue;
      }
      if (step.kind === "1q") {
        applyKQubit(state, n, [step.q], step.U);
        // 1q depolarising inverse on the gate's qubit.
        const s1 = sample1q(samp1qDepol);
        applyPauli1q(state, n, step.q, s1.pauli);
        weight *= s1.sign * samp1qDepol.gammaTotal;
        // Phase damping inverse on the gate's qubit.
        const sp = sample1q(sampPhaseDamp);
        applyPauli1q(state, n, step.q, sp.pauli);
        weight *= sp.sign * sampPhaseDamp.gammaTotal;
        // Amplitude damping inverse (non-Pauli) on the gate's qubit.
        weight *= applyAD(state, n, step.q, sampAmp);
        continue;
      }
      // step.kind === "2q"
      for (const aq of step.antiQubits) applyKQubit(state, n, [aq], M_X);
      applyKQubit(state, n, step.qubits, step.U);
      for (const aq of step.antiQubits) applyKQubit(state, n, [aq], M_X);
      // 2q depolarising inverse on the involved pair.
      const s2 = sample2q(samp2qDepol);
      applyPauli2q(state, n, step.involvedPair[0], step.involvedPair[1], s2.pA, s2.pB);
      weight *= s2.sign * samp2qDepol.gammaTotal;
      // Phase + amplitude damping inverse on each qubit independently.
      for (const q of step.involvedPair) {
        const sp = sample1q(sampPhaseDamp);
        applyPauli1q(state, n, q, sp.pauli);
        weight *= sp.sign * sampPhaseDamp.gammaTotal;
        weight *= applyAD(state, n, q, sampAmp);
      }
    }
    sum += weight * evaluateObservable(state, n, observable);
  }
  return {
    value: sum / trajectories,
    trajectories,
    varianceOverhead,
    channels: { oneQDepol: n1q, phaseDamping: nPhase, twoQDepol: n2q, amplitudeDamping: nAmp },
    uninverted,
  };
}

/**
 * Apply one AD-inverse trajectory sample to qubit q. Returns the weight
 * contribution sign · γ_total. Uses Math.random for both the basis-op
 * sampling and the measurement RNG (for Reset_k branches).
 */
function applyAD(state: Float64Array, n: number, q: number, s: InverseSamplerAD): number {
  if (s.gammaTotal <= 1) return 1; // identity-only when AD rate is 0
  const samp = sampleAD(s);
  switch (samp.action) {
    case "I": break;
    case "X": applyKQubit(state, n, [q], M_X); break;
    case "Y": applyKQubit(state, n, [q], M_Y); break;
    case "R0": applyResetK(state, n, q, 0, Math.random); break;
    case "R1": applyResetK(state, n, q, 1, Math.random); break;
  }
  return samp.sign * s.gammaTotal;
}

function hasMeasurements(gates: ReadonlyArray<{ gateId: string }>): boolean {
  for (const g of gates) {
    if (g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y") return true;
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Re-export for convenience.
export { simulate };
