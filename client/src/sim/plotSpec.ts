/**
 * On-demand custom plots from a small, validated **plot spec**.
 *
 * Rather than letting the AI (or the user) emit raw rendering code, a plot is
 * described by a constrained JSON `PlotSpec`: pick a *quantity* (what to
 * compute), an optional *sweep* axis (a time dimension to vary), and a *chart*
 * type. `computePlot` turns that into a generic `PlotData` dataset by
 * re-simulating the circuit at the needed points and computing the quantity
 * from the statevector — reusing the same helpers the bespoke panels use
 * (Pauli expectations, entropy profile, mutual information, ZZ correlations).
 *
 * A fixed `CustomPlotPanel` renderer draws the dataset. No code execution, so
 * a malformed or hostile spec can at worst ask for an unsupported combination
 * (rejected by `validatePlotSpec`) — never run arbitrary JS.
 *
 * Cost model mirrors the other "run on demand" panels: per-qubit quantities
 * are one simulation; sweep quantities are one simulation per step
 * (capped). Everything here is pure and synchronous.
 */

import { simulate, type ParameterValues } from "./simulate";
import { paulis, type Pauli } from "./expectation";
import { mutualInformationMatrix, entropyProfile, vonNeumannEntropy } from "./entanglement";
import { reducedDensityMatrix, purity } from "./density";
import { negativityMatrix } from "./negativity";
import { concurrenceMatrix } from "./concurrence";
import { magic } from "./magic";
import { allPauliExpectations } from "./pauliSpectrum";
import { zzCorrelations } from "./correlations";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

// ─── spec ─────────────────────────────────────────────────────────────

/** What to compute. Each quantity has a natural domain (qubit / basis / cut /
 *  pair) that, combined with the sweep, fixes the dataset shape. */
export type PlotQuantity =
  // per qubit (vector over qubits; sweepable)
  | "expZ" // ⟨Z_q⟩ per qubit, in [−1, +1]
  | "expX" // ⟨X_q⟩ per qubit
  | "expY" // ⟨Y_q⟩ per qubit
  | "qubitEntropy" // single-qubit entanglement entropy S(ρ_q) per qubit
  | "purityQubit" // single-qubit purity Tr(ρ_q²) per qubit
  | "coherenceQubit" // single-qubit l₁ coherence per qubit
  // per basis state (vector over 2ⁿ)
  | "prob" // probability per computational basis state
  | "amp" // |amplitude| per computational basis state
  | "phase" // amplitude phase arg(a) per computational basis state
  // 1-D profiles (vector over a custom domain; not sweepable)
  | "entropy" // S(ρ_{[0..k]}) per contiguous cut k
  | "renyi2" // 2-Rényi entanglement entropy per contiguous cut
  | "pauliWeight" // Pauli-weight distribution Σ_{|P|=w} Ξ_P (over weight w)
  // pairwise matrices (heatmaps)
  | "mutualInfo" // pairwise mutual information I(i:j)
  | "zzCorr" // connected ⟨Z_iZ_j⟩−⟨Z_i⟩⟨Z_j⟩
  | "xxCorr" // connected ⟨X_iX_j⟩−⟨X_i⟩⟨X_j⟩
  | "yyCorr" // connected ⟨Y_iY_j⟩−⟨Y_i⟩⟨Y_j⟩
  | "negativity" // pairwise log-negativity E_N(i:j)
  | "concurrence" // pairwise concurrence C(i:j)
  // scalars (single value; sweepable into one curve)
  | "midEntropy" // mid-cut entanglement entropy
  | "magic" // stabilizer-Rényi magic M₂
  | "meyerWallach" // Meyer–Wallach global entanglement Q
  | "participationEntropy" // Shannon participation entropy of |a|² (localization)
  | "l1Coherence"; // global l₁-norm coherence

/** Optional second dimension. `column` re-runs the circuit truncated after
 *  each column; `t` sweeps the `t` clock over one period [0, 2π). Both only
 *  combine with per-qubit quantities (expZ/expX/expY). */
export type PlotSweep = "none" | "column" | "t";

export type PlotChart = "bars" | "line" | "heatmap";

export type PlotSpec = {
  quantity: PlotQuantity;
  sweep: PlotSweep;
  chart: PlotChart;
  /** Optional human title; the renderer falls back to a generated one. */
  title?: string;
};

export const PLOT_QUANTITIES: PlotQuantity[] = [
  "expZ",
  "expX",
  "expY",
  "qubitEntropy",
  "purityQubit",
  "coherenceQubit",
  "prob",
  "amp",
  "phase",
  "entropy",
  "renyi2",
  "pauliWeight",
  "mutualInfo",
  "zzCorr",
  "xxCorr",
  "yyCorr",
  "negativity",
  "concurrence",
  "midEntropy",
  "magic",
  "meyerWallach",
  "participationEntropy",
  "l1Coherence",
];

export const QUANTITY_LABELS: Record<PlotQuantity, string> = {
  expZ: "⟨Z⟩ per qubit",
  expX: "⟨X⟩ per qubit",
  expY: "⟨Y⟩ per qubit",
  qubitEntropy: "entanglement entropy S(ρ_q) per qubit",
  purityQubit: "purity Tr(ρ_q²) per qubit",
  coherenceQubit: "l₁ coherence per qubit",
  prob: "probability per basis state",
  amp: "|amplitude| per basis state",
  phase: "amplitude phase per basis state",
  entropy: "entanglement entropy per cut",
  renyi2: "2-Rényi entropy per cut",
  pauliWeight: "Pauli-weight distribution",
  mutualInfo: "mutual information I(i:j)",
  zzCorr: "connected ⟨ZᵢZⱼ⟩ correlation",
  xxCorr: "connected ⟨XᵢXⱼ⟩ correlation",
  yyCorr: "connected ⟨YᵢYⱼ⟩ correlation",
  negativity: "log-negativity E_N(i:j)",
  concurrence: "concurrence C(i:j)",
  midEntropy: "mid-cut entanglement entropy",
  magic: "stabilizer-Rényi magic M₂",
  meyerWallach: "Meyer–Wallach global entanglement Q",
  participationEntropy: "participation entropy (basis)",
  l1Coherence: "l₁ coherence (global)",
};

// Per-qubit quantities form a vector over qubits and accept a sweep.
const PER_QUBIT = new Set<PlotQuantity>(["expZ", "expX", "expY", "qubitEntropy", "purityQubit", "coherenceQubit"]);
const PER_BASIS = new Set<PlotQuantity>(["prob", "amp", "phase"]);
// 1-D profiles over a custom domain (cut / Pauli weight); not sweepable.
const PROFILE = new Set<PlotQuantity>(["entropy", "renyi2", "pauliWeight"]);
const MATRIX = new Set<PlotQuantity>(["mutualInfo", "zzCorr", "xxCorr", "yyCorr", "negativity", "concurrence"]);
// Scalar quantities are a single number; with a sweep they trace one line.
const SCALAR = new Set<PlotQuantity>(["midEntropy", "magic", "meyerWallach", "participationEntropy", "l1Coherence"]);
// Signed quantities (diverging colour scale about 0); everything else is ≥ 0.
const SIGNED = new Set<PlotQuantity>(["expZ", "expX", "expY", "phase", "zzCorr", "xxCorr", "yyCorr"]);
/** Quantities that accept a `column`/`t` sweep. */
const SWEEPABLE = new Set<PlotQuantity>([...PER_QUBIT, ...SCALAR]);

// ─── caps ─────────────────────────────────────────────────────────────

const MAX_QUBITS_BASIS = 10; // 2^10 = 1024 bars/cells max
const MAX_QUBITS_MATRIX = 12;
const MAX_QUBITS_PERQ = 16;
const MAX_SWEEP_COLS = 64;
const T_POINTS = 48;

// ─── dataset ──────────────────────────────────────────────────────────

export type PlotData =
  | {
      kind: "series1d";
      xLabels: string[];
      values: number[];
      xAxis: string;
      yAxis: string;
      /** When true the renderer should diverge the colour scale about 0. */
      signed: boolean;
    }
  | {
      kind: "multiline";
      xValues: number[];
      series: { label: string; values: number[] }[];
      xAxis: string;
      yAxis: string;
      signed: boolean;
    }
  | {
      kind: "matrix";
      rowLabels: string[];
      colLabels: string[];
      z: number[][];
      xAxis: string;
      yAxis: string;
      signed: boolean;
    };

export type PlotResult = { data: PlotData } | { error: string };

// ─── validation ───────────────────────────────────────────────────────

/** Reject specs the engine can't fulfil *before* running any simulation.
 *  Returns null when valid, or a human-readable reason. */
export function validatePlotSpec(spec: PlotSpec): string | null {
  if (!PLOT_QUANTITIES.includes(spec.quantity)) return `unknown quantity "${spec.quantity}"`;
  if (!["none", "column", "t"].includes(spec.sweep)) return `unknown sweep "${spec.sweep}"`;
  if (!["bars", "line", "heatmap"].includes(spec.chart)) return `unknown chart "${spec.chart}"`;

  if (spec.sweep !== "none" && !SWEEPABLE.has(spec.quantity)) {
    return `a "${spec.sweep}" sweep only works with a per-qubit or scalar quantity`;
  }
  if (MATRIX.has(spec.quantity) && spec.chart !== "heatmap") {
    return `${QUANTITY_LABELS[spec.quantity]} is a matrix — use a heatmap`;
  }
  if (spec.sweep !== "none" && spec.chart === "bars") {
    return `a swept quantity is 2-D — use a line chart or heatmap`;
  }
  if (SCALAR.has(spec.quantity) && spec.sweep !== "none" && spec.chart === "heatmap") {
    return `${QUANTITY_LABELS[spec.quantity]} is a single value — use a line chart`;
  }
  return null;
}

/** Coerce an arbitrary JSON value into a PlotSpec, filling sane defaults and
 *  picking a chart compatible with the quantity when none/invalid is given.
 *  Used for AI- or storage-sourced specs. Returns null when unrecoverable. */
export function coercePlotSpec(raw: unknown): PlotSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const quantity = o.quantity;
  if (typeof quantity !== "string" || !PLOT_QUANTITIES.includes(quantity as PlotQuantity)) return null;
  const q = quantity as PlotQuantity;

  let sweep: PlotSweep = "none";
  if (o.sweep === "column" || o.sweep === "t") sweep = o.sweep;
  if (sweep !== "none" && !SWEEPABLE.has(q)) sweep = "none";

  let chart: PlotChart;
  if (o.chart === "bars" || o.chart === "line" || o.chart === "heatmap") chart = o.chart;
  else chart = defaultChart(q, sweep);
  // Repair impossible combinations rather than rejecting.
  if (MATRIX.has(q)) chart = "heatmap";
  if (sweep !== "none" && chart === "bars") chart = "line";
  if (SCALAR.has(q) && sweep !== "none" && chart === "heatmap") chart = "line";
  if (SCALAR.has(q) && sweep === "none") chart = "bars";

  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
  return { quantity: q, sweep, chart, title };
}

export function defaultChart(q: PlotQuantity, sweep: PlotSweep): PlotChart {
  if (MATRIX.has(q)) return "heatmap";
  if (sweep !== "none") return "line";
  return "bars";
}

/** Chart types the builder UI should offer for a quantity + sweep. */
export function chartChoicesFor(q: PlotQuantity, sweep: PlotSweep): PlotChart[] {
  if (MATRIX.has(q)) return ["heatmap"];
  if (SCALAR.has(q)) return sweep === "none" ? ["bars"] : ["line"];
  if (sweep !== "none") return ["line", "heatmap"];
  return ["bars", "line"];
}

/** Whether the quantity accepts a column/t sweep (drives the builder UI). */
export function isSweepable(q: PlotQuantity): boolean {
  return SWEEPABLE.has(q);
}

/** A short generated title for a spec with no explicit one. */
export function plotTitle(spec: PlotSpec): string {
  if (spec.title) return spec.title;
  const base = QUANTITY_LABELS[spec.quantity];
  if (spec.sweep === "column") return `${base} vs depth`;
  if (spec.sweep === "t") return `${base} vs t`;
  return base;
}

// ─── compute ──────────────────────────────────────────────────────────

const PAULI_OF: Record<string, Pauli> = { expZ: "Z", expX: "X", expY: "Y" };

const MAX_QUBITS_MAGIC = 6; // 4ⁿ Pauli expectations
const MAX_QUBITS_MIDENT = 14; // mid-cut reduced DM of ≤ 7 qubits
const MAX_QUBITS_SCALAR = 16; // meyer-wallach / participation / l1 over the full state

/** One per-qubit Pauli expectation over the whole register. */
function perQubitPauli(state: Float64Array, n: number, p: Pauli): number[] {
  const out = new Array<number>(n);
  for (let q = 0; q < n; q++) {
    const arr: Pauli[] = new Array(n).fill("I");
    arr[q] = p;
    out[q] = paulis(state, n, arr);
  }
  return out;
}

/** Single-qubit purity Tr(ρ_q²) for every qubit. */
function perQubitPurity(state: Float64Array, n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = purity(reducedDensityMatrix(state, n, [i]));
  return out;
}

/** Per-qubit value vector for any per-qubit quantity. */
function perQubitValue(state: Float64Array, n: number, q: PlotQuantity): number[] {
  if (q === "qubitEntropy") {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = vonNeumannEntropy(reducedDensityMatrix(state, n, [i]));
    return out;
  }
  if (q === "purityQubit") return perQubitPurity(state, n);
  if (q === "coherenceQubit") {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const rho = reducedDensityMatrix(state, n, [i]); // 2×2
      out[i] = 2 * Math.hypot(rho[0][1].re, rho[0][1].im); // l₁ coherence = |ρ01| + |ρ10|
    }
    return out;
  }
  return perQubitPauli(state, n, PAULI_OF[q]);
}

/** Connected single-Pauli correlator C(i,j) = ⟨P_iP_j⟩ − ⟨P_i⟩⟨P_j⟩ as a
 *  symmetric matrix (diagonal = local variance 1 − ⟨P_i⟩²). */
function connectedPauliCorr(state: Float64Array, n: number, p: Pauli): number[][] {
  const single = perQubitPauli(state, n, p);
  const conn: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const arr: Pauli[] = new Array(n).fill("I");
      arr[i] = p;
      arr[j] = p; // for i === j this is P², i.e. ⟨I⟩ = 1
      const pij = i === j ? 1 : paulis(state, n, arr);
      const c = pij - single[i] * single[j];
      conn[i][j] = c;
      conn[j][i] = c;
    }
  }
  return conn;
}

/** 2-Rényi entanglement entropy −log₂ Tr(ρ_A²) across every contiguous cut. */
function renyi2Profile(state: Float64Array, n: number, maxSide = 8): number[] | null {
  if (n < 2) return null;
  const out = new Array<number>(n - 1).fill(0);
  for (let k = 0; k < n - 1; k++) {
    const sizeA = k + 1;
    const sizeB = n - sizeA;
    const side =
      sizeA <= sizeB
        ? Array.from({ length: sizeA }, (_, q) => q)
        : Array.from({ length: sizeB }, (_, q) => sizeA + q);
    if (side.length > maxSide) continue;
    const p2 = purity(reducedDensityMatrix(state, n, side));
    out[k] = p2 > 1e-12 ? -Math.log2(p2) : 0;
  }
  return out;
}

/** A scalar quantity of the whole state, or null if out of range / undefined. */
function scalarValue(state: Float64Array, n: number, q: PlotQuantity): number | null {
  if (q === "magic") {
    if (n > MAX_QUBITS_MAGIC) return null;
    return magic(allPauliExpectations(state, n), n).m2;
  }
  if (q === "meyerWallach") {
    if (n > MAX_QUBITS_SCALAR) return null;
    const pur = perQubitPurity(state, n);
    let s = 0;
    for (const p of pur) s += 1 - p;
    return (2 / n) * s; // Meyer–Wallach Q ∈ [0, 1]
  }
  if (q === "participationEntropy") {
    if (n > MAX_QUBITS_SCALAR) return null;
    const dim = 1 << n;
    let s = 0;
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      const p = re * re + im * im;
      if (p > 1e-15) s -= p * Math.log2(p);
    }
    return s; // Shannon participation entropy in bits
  }
  if (q === "l1Coherence") {
    if (n > MAX_QUBITS_SCALAR) return null;
    const dim = 1 << n;
    let sumAbs = 0;
    for (let i = 0; i < dim; i++) sumAbs += Math.hypot(state[2 * i], state[2 * i + 1]);
    return Math.max(0, sumAbs * sumAbs - 1); // pure-state l₁ coherence = (Σ|a_i|)² − 1
  }
  // midEntropy
  if (n < 2 || n > MAX_QUBITS_MIDENT) return null;
  const prof = entropyProfile(state, n);
  if (!prof) return null;
  const mid = Math.floor(n / 2) - 1; // central cut index in [0 … n−2]
  const v = prof.entropy[mid];
  return Number.isFinite(v) ? v : null;
}

export function computePlot(
  spec: PlotSpec,
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
): PlotResult {
  const invalid = validatePlotSpec(spec);
  if (invalid) return { error: invalid };

  const n = circuit.numQubits;
  if (n < 1) return { error: "the circuit has no qubits" };

  // ── swept (2-D) per-qubit or scalar-over-time quantities ─────────
  if (spec.sweep !== "none") {
    const isScalar = SCALAR.has(spec.quantity);
    if (!isScalar && n > MAX_QUBITS_PERQ) return { error: `${n} qubits — capped at ${MAX_QUBITS_PERQ}` };
    const qubitNames = (q: number) => circuit.qubitNames?.[q]?.trim() || `q${q}`;

    // States to sample, paired with their x-axis value/label.
    const samples: { state: Float64Array; x: number }[] = [];
    let xAxis: string;
    if (spec.sweep === "column") {
      const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
      const numCols = maxCol + 1;
      if (numCols < 1) return { error: "place some gates first" };
      if (numCols > MAX_SWEEP_COLS) return { error: `${numCols} columns — capped at ${MAX_SWEEP_COLS}` };
      for (let c = 0; c < numCols; c++) {
        const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
        samples.push({ state: simulate(sub, paramValues, customGates).state, x: c });
      }
      xAxis = "column";
    } else {
      for (let k = 0; k < T_POINTS; k++) {
        const t = (2 * Math.PI * k) / (T_POINTS - 1);
        samples.push({ state: simulate(circuit, { ...paramValues, t }, customGates).state, x: t });
      }
      xAxis = "t";
    }

    if (isScalar) {
      const values = samples.map((s) => scalarValue(s.state, n, spec.quantity));
      if (values.some((v) => v === null)) return { error: `${QUANTITY_LABELS[spec.quantity]} — out of range for ${n} qubits` };
      return {
        data: {
          kind: "multiline",
          xValues: samples.map((s) => s.x),
          series: [{ label: symbolFor(spec.quantity), values: values as number[] }],
          xAxis,
          yAxis: symbolFor(spec.quantity),
          signed: false,
        },
      };
    }

    const byStep = samples.map((s) => perQubitValue(s.state, n, spec.quantity));
    return finishSweep(spec, n, byStep, samples.map((s) => s.x), xAxis, qubitNames);
  }

  // ── single-shot (no sweep) ───────────────────────────────────────
  const res = simulate(circuit, paramValues, customGates);
  if (res.isStabilizer && PER_BASIS.has(spec.quantity)) {
    return { error: "Clifford fast path — explicit amplitudes are not enumerated" };
  }
  const state = res.state;

  if (PER_QUBIT.has(spec.quantity)) {
    if (n > MAX_QUBITS_PERQ) return { error: `${n} qubits — capped at ${MAX_QUBITS_PERQ}` };
    const values = perQubitValue(state, n, spec.quantity);
    const labels = Array.from({ length: n }, (_, q) => circuit.qubitNames?.[q]?.trim() || `q${q}`);
    return {
      data: {
        kind: "series1d",
        xLabels: labels,
        values,
        xAxis: "qubit",
        yAxis: symbolFor(spec.quantity),
        signed: SIGNED.has(spec.quantity),
      },
    };
  }

  if (SCALAR.has(spec.quantity)) {
    const v = scalarValue(state, n, spec.quantity);
    if (v === null) return { error: `${QUANTITY_LABELS[spec.quantity]} — out of range for ${n} qubits` };
    return {
      data: {
        kind: "series1d",
        xLabels: ["final"],
        values: [v],
        xAxis: "",
        yAxis: symbolFor(spec.quantity),
        signed: false,
      },
    };
  }

  if (PER_BASIS.has(spec.quantity)) {
    if (n > MAX_QUBITS_BASIS) return { error: `${n} qubits — basis plots capped at ${MAX_QUBITS_BASIS}` };
    const dim = 1 << n;
    const values = new Array<number>(dim);
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      if (spec.quantity === "prob") values[i] = re * re + im * im;
      else if (spec.quantity === "amp") values[i] = Math.hypot(re, im);
      else values[i] = Math.atan2(im, re); // phase ∈ (−π, π]
    }
    const labels = Array.from({ length: dim }, (_, i) => i.toString(2).padStart(n, "0"));
    return {
      data: {
        kind: "series1d",
        xLabels: labels,
        values,
        xAxis: "basis state",
        yAxis: spec.quantity === "prob" ? "probability" : spec.quantity === "amp" ? "|amplitude|" : "arg(a)",
        signed: spec.quantity === "phase",
      },
    };
  }

  if (PROFILE.has(spec.quantity)) {
    if (spec.quantity === "pauliWeight") {
      if (n > MAX_QUBITS_MAGIC) return { error: `${n} qubits — Pauli-weight capped at ${MAX_QUBITS_MAGIC}` };
      const wd = magic(allPauliExpectations(state, n), n).weightDist;
      return {
        data: {
          kind: "series1d",
          xLabels: wd.map((_, w) => String(w)),
          values: wd,
          xAxis: "Pauli weight",
          yAxis: "Σ Ξ_P",
          signed: false,
        },
      };
    }
    if (n < 2) return { error: "entropy profile needs ≥ 2 qubits" };
    const vals = spec.quantity === "renyi2" ? renyi2Profile(state, n) : entropyProfile(state, n)?.entropy ?? null;
    if (!vals) return { error: `${n} qubits — entropy profile out of range` };
    return {
      data: {
        kind: "series1d",
        xLabels: vals.map((_, k) => `${k}|${k + 1}`),
        values: vals.map((v) => (Number.isFinite(v) ? v : 0)),
        xAxis: "cut",
        yAxis: spec.quantity === "renyi2" ? "S₂ [bits]" : "S(ρ) [bits]",
        signed: false,
      },
    };
  }

  // matrix quantities
  if (n < 2) return { error: "needs ≥ 2 qubits" };
  if (n > MAX_QUBITS_MATRIX) return { error: `${n} qubits — capped at ${MAX_QUBITS_MATRIX}` };
  const labels = Array.from({ length: n }, (_, q) => circuit.qubitNames?.[q]?.trim() || `q${q}`);
  if (spec.quantity === "mutualInfo") {
    const mi = mutualInformationMatrix(state, n);
    if (!mi) return { error: "mutual information out of range" };
    return {
      data: { kind: "matrix", rowLabels: labels, colLabels: labels, z: mi.mi, xAxis: "qubit j", yAxis: "qubit i", signed: false },
    };
  }
  if (spec.quantity === "negativity") {
    const ng = negativityMatrix(state, n);
    if (!ng) return { error: "log-negativity out of range" };
    return {
      data: { kind: "matrix", rowLabels: labels, colLabels: labels, z: ng.neg, xAxis: "qubit j", yAxis: "qubit i", signed: false },
    };
  }
  if (spec.quantity === "concurrence") {
    const cc = concurrenceMatrix(state, n);
    if (!cc) return { error: "concurrence out of range" };
    return {
      data: { kind: "matrix", rowLabels: labels, colLabels: labels, z: cc.c, xAxis: "qubit j", yAxis: "qubit i", signed: false },
    };
  }
  if (spec.quantity === "xxCorr" || spec.quantity === "yyCorr") {
    const conn = connectedPauliCorr(state, n, spec.quantity === "xxCorr" ? "X" : "Y");
    return {
      data: { kind: "matrix", rowLabels: labels, colLabels: labels, z: conn, xAxis: "qubit j", yAxis: "qubit i", signed: true },
    };
  }
  const zz = zzCorrelations(state, n);
  if (!zz) return { error: "ZZ correlations out of range" };
  return {
    data: { kind: "matrix", rowLabels: labels, colLabels: labels, z: zz.conn, xAxis: "qubit j", yAxis: "qubit i", signed: true },
  };
}

function finishSweep(
  spec: PlotSpec,
  n: number,
  byStep: number[][], // [step][qubit]
  xValues: number[],
  xAxis: string,
  qubitName: (q: number) => string,
): PlotResult {
  const sym = symbolFor(spec.quantity);
  const signed = SIGNED.has(spec.quantity);
  if (spec.chart === "heatmap") {
    // rows = qubits, cols = steps
    const z: number[][] = Array.from({ length: n }, (_, q) => byStep.map((row) => row[q]));
    const colLabels = xValues.map((v) => (xAxis === "t" ? (v / Math.PI).toFixed(2) + "π" : String(v)));
    const rowLabels = Array.from({ length: n }, (_, q) => qubitName(q));
    return { data: { kind: "matrix", rowLabels, colLabels, z, xAxis, yAxis: "qubit", signed } };
  }
  // multiline: one series per qubit
  const series = Array.from({ length: n }, (_, q) => ({ label: qubitName(q), values: byStep.map((row) => row[q]) }));
  return { data: { kind: "multiline", xValues, series, xAxis, yAxis: sym, signed } };
}

function symbolFor(q: PlotQuantity): string {
  if (q === "expZ") return "⟨Z⟩";
  if (q === "expX") return "⟨X⟩";
  if (q === "expY") return "⟨Y⟩";
  if (q === "qubitEntropy") return "S(ρ_q) [bits]";
  if (q === "purityQubit") return "Tr(ρ_q²)";
  if (q === "coherenceQubit") return "C₁(ρ_q)";
  if (q === "midEntropy") return "S(ρ) [bits]";
  if (q === "magic") return "M₂ [bits]";
  if (q === "meyerWallach") return "Q";
  if (q === "participationEntropy") return "S_part [bits]";
  if (q === "l1Coherence") return "C₁";
  return QUANTITY_LABELS[q];
}
