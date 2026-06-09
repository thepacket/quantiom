/**
 * "Plot programs" — AI- (or user-) written code that draws a custom plot,
 * executed under a strict sandbox.
 *
 * This is the flexible counterpart to the validated `PlotSpec` engine
 * (`plotSpec.ts`): instead of choosing from a fixed catalog, a short snippet
 * of JavaScript computes whatever it likes from the statevector and returns a
 * **declarative scene** (lines / rects / circles / paths / text) that the main
 * thread renders to SVG.
 *
 * Safety model — the code is never trusted:
 *  1. It runs in a **Web Worker**, so it has no DOM, no `window`, no React.
 *  2. Network / storage / nested-worker globals are neutered inside the worker
 *     before the code runs (no exfiltration of the user's data).
 *  3. A hard **timeout** terminates a runaway worker (no main-thread hang).
 *  4. The returned scene is **sanitised**: element types are whitelisted,
 *     numbers are clamped to finite ranges, colours are restricted to hex /
 *     rgb / hsl / a small `var(--…)` theme set, and `path` data is limited to
 *     SVG path tokens — so nothing it returns can inject markup, CSS, or URLs.
 *
 * The code receives one argument `data` (a `PlotProgramInput`) and must
 * `return` a `PlotScene`. Pure functions of `data` only.
 */

import { simulate, type ParameterValues } from "./simulate";
import { sampleMeasurementShots } from "./measurementShots";
import { reducedDensityMatrix } from "./density";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

// ─── public types ─────────────────────────────────────────────────────

/** Read-only data handed to a plot program. Plain structured-cloneable data. */
export type PlotProgramInput = {
  /** Number of qubits. */
  n: number;
  /** Hilbert-space dimension 2ⁿ. */
  dim: number;
  /** Real parts of the amplitudes, length `dim`. */
  ampRe: number[];
  /** Imag parts of the amplitudes, length `dim`. */
  ampIm: number[];
  /** Probabilities |aᵢ|², length `dim`. */
  prob: number[];
  /** Number of circuit columns (time steps). */
  numColumns: number;
  /** Number of classical bits in the circuit. */
  numClbits: number;
  /** Final classical-register bits (0/1) from one collapsed run, big-endian
   *  (clbit 0 leftmost), or `null` if the circuit has no measurements. */
  clbits: number[] | null;
  /** Measurement-outcome histogram over `shots` independent runs:
   *  `{ bitstring: count }`, or `null` if the circuit has no measurements. */
  counts: Record<string, number> | null;
  /** Number of shots sampled for `counts` (0 when there are no measurements). */
  shots: number;
  /** Per-qubit reduced density matrices ρ_q (2×2), one per qubit. Each is
   *  row-major: `re`/`im` are length-4 [ρ00, ρ01, ρ10, ρ11]. The diagonal
   *  gives P(0)/P(1); from these you can read ⟨Z⟩=ρ00−ρ11, ⟨X⟩=2·Re ρ01,
   *  ⟨Y⟩=2·Im ρ10, and the purity Tr(ρ_q²). */
  rho1: { re: number[]; im: number[] }[];
  /** Suggested drawing-canvas size, in the scene's own coordinate units. */
  width: number;
  height: number;
  /** Theme colours the program may use (also accepted as literal strings). */
  palette: { accent: string; accent2: string; warm: string; muted: string; border: string };
};

export type PlotElement =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth?: number }
  | { type: "rect"; x: number; y: number; width: number; height: number; fill?: string; stroke?: string; opacity?: number }
  | { type: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; opacity?: number }
  | { type: "path"; d: string; stroke?: string; fill?: string; strokeWidth?: number }
  | { type: "polyline"; points: [number, number][]; stroke?: string; fill?: string; strokeWidth?: number }
  | { type: "text"; x: number; y: number; text: string; fill?: string; anchor?: "start" | "middle" | "end"; size?: number };

export type PlotScene = {
  width: number;
  height: number;
  title?: string;
  elements: PlotElement[];
};

export type PlotProgramResult = { scene: PlotScene } | { error: string };

// ─── caps ─────────────────────────────────────────────────────────────

const MAX_QUBITS_PROGRAM = 14; // 2¹⁴ amplitudes cloned to the worker
const PROGRAM_SHOTS = 1024; // measurement-histogram sample size
const DEFAULT_W = 320;
const DEFAULT_H = 180;
const MAX_ELEMENTS = 4000;
const MAX_POINTS = 4000;
const TIMEOUT_MS = 2500;

// ─── input builder ────────────────────────────────────────────────────

export function buildPlotProgramInput(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
): PlotProgramInput | { error: string } {
  const n = circuit.numQubits;
  if (n < 1) return { error: "the circuit has no qubits" };
  if (n > MAX_QUBITS_PROGRAM) return { error: `${n} qubits — plot programs are capped at ${MAX_QUBITS_PROGRAM}` };
  const res = simulate(circuit, paramValues, customGates);
  if (res.isStabilizer) return { error: "Clifford fast path — explicit amplitudes are not available to a plot program" };
  const dim = 1 << n;
  const ampRe = new Array<number>(dim);
  const ampIm = new Array<number>(dim);
  const prob = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const re = res.state[2 * i];
    const im = res.state[2 * i + 1];
    ampRe[i] = re;
    ampIm[i] = im;
    prob[i] = re * re + im * im;
  }
  const numColumns = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1) + 1;

  // Measurement outcomes: the final classical register from this run, plus a
  // shot histogram (only when the circuit actually measures).
  const hasMeasurement = Array.isArray(res.measurementRecord) && res.measurementRecord.length > 0;
  const clbits = hasMeasurement ? res.measurementRecord!.map((v) => (v ? 1 : 0)) : null;
  let counts: Record<string, number> | null = null;
  let shots = 0;
  if (hasMeasurement) {
    const map = sampleMeasurementShots(circuit, paramValues, customGates, PROGRAM_SHOTS);
    counts = {};
    for (const [k, v] of map) counts[k] = v;
    shots = PROGRAM_SHOTS;
  }

  // Per-qubit reduced density matrices ρ_q (2×2, row-major).
  const rho1 = Array.from({ length: n }, (_, q) => {
    const rho = reducedDensityMatrix(res.state, n, [q]);
    return {
      re: [rho[0][0].re, rho[0][1].re, rho[1][0].re, rho[1][1].re],
      im: [rho[0][0].im, rho[0][1].im, rho[1][0].im, rho[1][1].im],
    };
  });

  return {
    n,
    dim,
    ampRe,
    ampIm,
    prob,
    numColumns,
    numClbits: circuit.numClbits,
    clbits,
    counts,
    shots,
    rho1,
    width: DEFAULT_W,
    height: DEFAULT_H,
    palette: { accent: "#7aa2ff", accent2: "#4f9eff", warm: "#ff9a5a", muted: "#8b95a6", border: "#262c36" },
  };
}

// ─── sanitisation (pure, tested) ──────────────────────────────────────

const NAMED_COLORS = new Set([
  "red", "green", "blue", "orange", "purple", "yellow", "cyan", "magenta",
  "white", "black", "gray", "grey", "teal", "pink", "lime", "navy", "gold", "transparent", "none",
]);
const THEME_VARS = new Set([
  "var(--accent)", "var(--accent-2)", "var(--warm)", "var(--muted)",
  "var(--border)", "var(--fg)", "var(--bg)", "var(--bg-2)",
]);

/** Restrict colours to safe literal forms; anything else falls back. */
export function sanitizeColor(c: unknown, fallback = "var(--accent)"): string {
  if (typeof c !== "string") return fallback;
  const s = c.trim();
  if (s.length > 40) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgba?\(\s*[\d.\s,%]+\)$/.test(s)) return s;
  if (/^hsla?\(\s*[\d.\s,%]+\)$/.test(s)) return s;
  if (THEME_VARS.has(s)) return s;
  if (NAMED_COLORS.has(s.toLowerCase())) return s;
  return fallback;
}

/** Keep only valid SVG path-data tokens (commands + numbers). */
export function sanitizePathD(d: unknown): string | null {
  if (typeof d !== "string") return null;
  if (d.length > 20000) return null;
  if (!/^[MmLlHhVvCcSsQqTtAaZz0-9eE,.\s+-]*$/.test(d)) return null;
  return d;
}

function num(v: unknown, fallback: number, lo = -1e6, hi = 1e6): number {
  const x = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}

function str(v: unknown, max = 200): string {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

function sanitizeElement(raw: unknown): PlotElement | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case "line":
      return { type: "line", x1: num(e.x1, 0), y1: num(e.y1, 0), x2: num(e.x2, 0), y2: num(e.y2, 0), stroke: sanitizeColor(e.stroke), strokeWidth: num(e.strokeWidth, 1, 0, 20) };
    case "rect":
      return { type: "rect", x: num(e.x, 0), y: num(e.y, 0), width: num(e.width, 0, 0), height: num(e.height, 0, 0), fill: sanitizeColor(e.fill), stroke: e.stroke != null ? sanitizeColor(e.stroke, "none") : "none", opacity: num(e.opacity, 1, 0, 1) };
    case "circle":
      return { type: "circle", cx: num(e.cx, 0), cy: num(e.cy, 0), r: num(e.r, 1, 0, 1e4), fill: sanitizeColor(e.fill), stroke: e.stroke != null ? sanitizeColor(e.stroke, "none") : "none", opacity: num(e.opacity, 1, 0, 1) };
    case "path": {
      const d = sanitizePathD(e.d);
      if (d === null) return null;
      return { type: "path", d, stroke: sanitizeColor(e.stroke), fill: e.fill != null ? sanitizeColor(e.fill, "none") : "none", strokeWidth: num(e.strokeWidth, 1, 0, 20) };
    }
    case "polyline": {
      if (!Array.isArray(e.points)) return null;
      const pts = e.points.slice(0, MAX_POINTS).map((p) => {
        const a = Array.isArray(p) ? p : [];
        return [num(a[0], 0), num(a[1], 0)] as [number, number];
      });
      return { type: "polyline", points: pts, stroke: sanitizeColor(e.stroke), fill: e.fill != null ? sanitizeColor(e.fill, "none") : "none", strokeWidth: num(e.strokeWidth, 1, 0, 20) };
    }
    case "text": {
      const anchor = e.anchor === "start" || e.anchor === "middle" || e.anchor === "end" ? e.anchor : "start";
      return { type: "text", x: num(e.x, 0), y: num(e.y, 0), text: str(e.text), fill: sanitizeColor(e.fill, "var(--muted)"), anchor, size: num(e.size, 9, 1, 64) };
    }
    default:
      return null;
  }
}

/** Validate + clamp a raw object into a safe `PlotScene`, or return an error. */
export function sanitizePlotScene(raw: unknown): PlotProgramResult {
  if (!raw || typeof raw !== "object") return { error: "the program did not return an object" };
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.elements)) return { error: "the scene has no `elements` array" };
  const width = num(s.width, DEFAULT_W, 50, 2000);
  const height = num(s.height, DEFAULT_H, 50, 2000);
  const elements: PlotElement[] = [];
  for (const raw of s.elements.slice(0, MAX_ELEMENTS)) {
    const el = sanitizeElement(raw);
    if (el) elements.push(el);
  }
  if (elements.length === 0) return { error: "the scene has no drawable elements" };
  return { scene: { width, height, title: s.title != null ? str(s.title, 120) : undefined, elements } };
}

// ─── sandboxed execution ──────────────────────────────────────────────

/** The worker source. Neuters dangerous globals, then runs the user code as
 *  the body of `(data) => …` and posts back the returned value. */
const WORKER_SRC = `
self.onmessage = function (ev) {
  // Neuter exfiltration / nested-execution surfaces. postMessage stays so we
  // can reply (a dedicated worker's postMessage only reaches the parent page).
  try {
    var kill = ["fetch","XMLHttpRequest","WebSocket","EventSource","importScripts",
      "indexedDB","caches","BroadcastChannel","Worker","SharedWorker","navigator"];
    for (var i = 0; i < kill.length; i++) { try { self[kill[i]] = undefined; } catch (e) {} }
  } catch (e) {}
  var data = ev.data && ev.data.data;
  var code = ev.data && ev.data.code;
  try {
    var fn = new Function("data", '"use strict";\\n' + code);
    var out = fn(data);
    self.postMessage({ ok: true, scene: out });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
`;

let workerUrl: string | null = null;
function getWorkerUrl(): string | null {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return null;
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  return workerUrl;
}

/**
 * Run a plot program in the sandbox and return a sanitised scene. Resolves
 * (never rejects) with `{ scene }` or `{ error }`. Terminates the worker on
 * timeout, error, or completion.
 */
export function runPlotProgram(code: string, input: PlotProgramInput, timeoutMs = TIMEOUT_MS): Promise<PlotProgramResult> {
  return new Promise((resolve) => {
    const url = getWorkerUrl();
    if (!url) {
      resolve({ error: "Web Workers are unavailable — the plot sandbox can't run here." });
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch {
      resolve({ error: "could not start the plot sandbox" });
      return;
    }
    let settled = false;
    const finish = (r: PlotProgramResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch { /* ignore */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ error: `the plot program timed out (> ${timeoutMs} ms) — it may have an infinite loop` }), timeoutMs);
    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d && d.ok) finish(sanitizePlotScene(d.scene));
      else finish({ error: typeof d?.error === "string" ? d.error : "the plot program threw an error" });
    };
    worker.onerror = (e) => finish({ error: e.message || "the plot program crashed" });
    try {
      worker.postMessage({ code, data: input });
    } catch (e) {
      finish({ error: e instanceof Error ? e.message : "could not send data to the sandbox" });
    }
  });
}
