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
import { mutualInformationMatrix, entropyProfile } from "./entanglement";
import { zzCorrelations } from "./correlations";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

// ─── spec ─────────────────────────────────────────────────────────────

/** What to compute. Each quantity has a natural domain (qubit / basis / cut /
 *  pair) that, combined with the sweep, fixes the dataset shape. */
export type PlotQuantity =
  | "expZ" // ⟨Z_q⟩ per qubit, in [−1, +1]
  | "expX" // ⟨X_q⟩ per qubit
  | "expY" // ⟨Y_q⟩ per qubit
  | "prob" // probability per computational basis state
  | "amp" // |amplitude| per computational basis state
  | "entropy" // S(ρ_{[0..k]}) per contiguous cut k
  | "mutualInfo" // pairwise mutual information I(i:j) (matrix)
  | "zzCorr"; // connected ⟨Z_iZ_j⟩−⟨Z_i⟩⟨Z_j⟩ (matrix)

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
  "prob",
  "amp",
  "entropy",
  "mutualInfo",
  "zzCorr",
];

export const QUANTITY_LABELS: Record<PlotQuantity, string> = {
  expZ: "⟨Z⟩ per qubit",
  expX: "⟨X⟩ per qubit",
  expY: "⟨Y⟩ per qubit",
  prob: "probability per basis state",
  amp: "|amplitude| per basis state",
  entropy: "entanglement entropy per cut",
  mutualInfo: "mutual information I(i:j)",
  zzCorr: "connected ⟨ZᵢZⱼ⟩ correlation",
};

const PER_QUBIT = new Set<PlotQuantity>(["expZ", "expX", "expY"]);
const PER_BASIS = new Set<PlotQuantity>(["prob", "amp"]);
const MATRIX = new Set<PlotQuantity>(["mutualInfo", "zzCorr"]);

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

  if (spec.sweep !== "none" && !PER_QUBIT.has(spec.quantity)) {
    return `a "${spec.sweep}" sweep only works with a per-qubit quantity (⟨Z⟩/⟨X⟩/⟨Y⟩)`;
  }
  if (MATRIX.has(spec.quantity) && spec.chart !== "heatmap") {
    return `${QUANTITY_LABELS[spec.quantity]} is a matrix — use a heatmap`;
  }
  if (spec.sweep !== "none" && spec.chart === "bars") {
    return `a swept quantity is 2-D — use a line chart or heatmap`;
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
  if (sweep !== "none" && !PER_QUBIT.has(q)) sweep = "none";

  let chart: PlotChart;
  if (o.chart === "bars" || o.chart === "line" || o.chart === "heatmap") chart = o.chart;
  else chart = defaultChart(q, sweep);
  // Repair impossible combinations rather than rejecting.
  if (MATRIX.has(q)) chart = "heatmap";
  if (sweep !== "none" && chart === "bars") chart = "line";

  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
  return { quantity: q, sweep, chart, title };
}

export function defaultChart(q: PlotQuantity, sweep: PlotSweep): PlotChart {
  if (MATRIX.has(q)) return "heatmap";
  if (sweep !== "none") return "line";
  return "bars";
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

  // ── swept (2-D) per-qubit quantities ─────────────────────────────
  if (spec.sweep !== "none") {
    if (n > MAX_QUBITS_PERQ) return { error: `${n} qubits — capped at ${MAX_QUBITS_PERQ}` };
    const p = PAULI_OF[spec.quantity];
    const qubitNames = (q: number) => circuit.qubitNames?.[q]?.trim() || `q${q}`;

    if (spec.sweep === "column") {
      const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
      const numCols = maxCol + 1;
      if (numCols < 1) return { error: "place some gates first" };
      if (numCols > MAX_SWEEP_COLS) return { error: `${numCols} columns — capped at ${MAX_SWEEP_COLS}` };
      const cols: number[][] = []; // [step][qubit]
      for (let c = 0; c < numCols; c++) {
        const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= c) };
        const res = simulate(sub, paramValues, customGates);
        cols.push(perQubitPauli(res.state, n, p));
      }
      return finishSweep(spec, n, cols, cols.map((_, c) => c), "column", qubitNames);
    }

    // sweep === "t"
    const xs: number[] = [];
    const rows: number[][] = []; // [step][qubit]
    for (let k = 0; k < T_POINTS; k++) {
      const t = (2 * Math.PI * k) / (T_POINTS - 1);
      xs.push(t);
      const res = simulate(circuit, { ...paramValues, t }, customGates);
      rows.push(perQubitPauli(res.state, n, p));
    }
    return finishSweep(spec, n, rows, xs, "t", qubitNames);
  }

  // ── single-shot (no sweep) ───────────────────────────────────────
  const res = simulate(circuit, paramValues, customGates);
  if (res.isStabilizer && PER_BASIS.has(spec.quantity)) {
    return { error: "Clifford fast path — explicit amplitudes are not enumerated" };
  }
  const state = res.state;

  if (PER_QUBIT.has(spec.quantity)) {
    if (n > MAX_QUBITS_PERQ) return { error: `${n} qubits — capped at ${MAX_QUBITS_PERQ}` };
    const values = perQubitPauli(state, n, PAULI_OF[spec.quantity]);
    const labels = Array.from({ length: n }, (_, q) => circuit.qubitNames?.[q]?.trim() || `q${q}`);
    return {
      data: { kind: "series1d", xLabels: labels, values, xAxis: "qubit", yAxis: symbolFor(spec.quantity), signed: true },
    };
  }

  if (PER_BASIS.has(spec.quantity)) {
    if (n > MAX_QUBITS_BASIS) return { error: `${n} qubits — basis plots capped at ${MAX_QUBITS_BASIS}` };
    const dim = 1 << n;
    const values = new Array<number>(dim);
    for (let i = 0; i < dim; i++) {
      const re = state[2 * i];
      const im = state[2 * i + 1];
      const mag2 = re * re + im * im;
      values[i] = spec.quantity === "prob" ? mag2 : Math.sqrt(mag2);
    }
    const labels = Array.from({ length: dim }, (_, i) => i.toString(2).padStart(n, "0"));
    return {
      data: {
        kind: "series1d",
        xLabels: labels,
        values,
        xAxis: "basis state",
        yAxis: spec.quantity === "prob" ? "probability" : "|amplitude|",
        signed: false,
      },
    };
  }

  if (spec.quantity === "entropy") {
    if (n < 2) return { error: "entropy profile needs ≥ 2 qubits" };
    const prof = entropyProfile(state, n);
    if (!prof) return { error: `${n} qubits — entropy profile out of range` };
    const labels = prof.entropy.map((_, k) => `${k}|${k + 1}`);
    return {
      data: {
        kind: "series1d",
        xLabels: labels,
        values: prof.entropy.map((v) => (Number.isNaN(v) ? 0 : v)),
        xAxis: "cut",
        yAxis: "S(ρ) [bits]",
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
  if (spec.chart === "heatmap") {
    // rows = qubits, cols = steps
    const z: number[][] = Array.from({ length: n }, (_, q) => byStep.map((row) => row[q]));
    const colLabels = xValues.map((v) => (xAxis === "t" ? (v / Math.PI).toFixed(2) + "π" : String(v)));
    const rowLabels = Array.from({ length: n }, (_, q) => qubitName(q));
    return { data: { kind: "matrix", rowLabels, colLabels, z, xAxis, yAxis: "qubit", signed: true } };
  }
  // multiline: one series per qubit
  const series = Array.from({ length: n }, (_, q) => ({ label: qubitName(q), values: byStep.map((row) => row[q]) }));
  return { data: { kind: "multiline", xValues, series, xAxis, yAxis: sym, signed: true } };
}

function symbolFor(q: PlotQuantity): string {
  if (q === "expZ") return "⟨Z⟩";
  if (q === "expX") return "⟨X⟩";
  if (q === "expY") return "⟨Y⟩";
  return QUANTITY_LABELS[q];
}
