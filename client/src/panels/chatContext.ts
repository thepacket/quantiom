import type { Circuit } from "../editor/types";
import type { SimResult } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";
import { estimateResources } from "../sim/resources";

/**
 * Serialise simulator-derived quantities into compact human-readable
 * blocks for the AI chat panel to attach to a message. Each function
 * returns a single string (or null when the quantity isn't available)
 * that ends without a trailing newline; ChatPanel joins them with
 * blank-line separators.
 *
 * Top-K caps for distributions: 2^20 amplitudes would blow any model's
 * context window, so we sort by |amplitude|² and emit the top 64
 * non-zero entries. The header notes the total dimension + the captured
 * cumulative probability so the model knows whether it's seeing
 * essentially-all of the support or only a tail-truncated slice.
 */

export type AttachKey =
  | "statevector"
  | "probabilities"
  | "bloch"
  | "resources"
  | "noise"
  | "classicalRegister";

export const ALL_ATTACH_KEYS: AttachKey[] = [
  "statevector",
  "probabilities",
  "bloch",
  "resources",
  "noise",
  "classicalRegister",
];

export const ATTACH_LABELS: Record<AttachKey, string> = {
  statevector: "statevector",
  probabilities: "probabilities",
  bloch: "Bloch vectors",
  resources: "resources",
  noise: "noise model",
  classicalRegister: "classical register",
};

const TOPK = 64;

export function serialiseStatevector(sim: SimResult): string | null {
  if (sim.isStabilizer) return "Statevector: (Clifford fast path — exact tableau, no explicit amplitudes)";
  const total = sim.amplitudes.length;
  if (total === 0) return null;
  const ranked = [...sim.amplitudes]
    .filter((a) => !a.isZero)
    .sort((a, b) => (b.re * b.re + b.im * b.im) - (a.re * a.re + a.im * a.im))
    .slice(0, TOPK);
  let capturedP = 0;
  for (const a of ranked) capturedP += a.re * a.re + a.im * a.im;
  const header = sim.isNoisy
    ? `Statevector (NOISE: one representative trajectory, not the true mixed state; T=${sim.trajectories ?? "?"} trajectories averaged elsewhere)`
    : `Statevector`;
  const lines = ranked.map((a) =>
    `|${a.basis}⟩  ${fmtCx(a.re, a.im)}  (|a|² = ${(a.re * a.re + a.im * a.im).toFixed(6)})`,
  );
  return [
    `${header} — ${ranked.length} of ${total} basis states shown (top by |a|²; captured Σ|a|² = ${capturedP.toFixed(6)})`,
    ...lines,
  ].join("\n");
}

export function serialiseProbabilities(sim: SimResult): string | null {
  if (sim.isStabilizer) return "Probabilities: (Clifford fast path — exact tableau marginals; full distribution not enumerated)";
  const n = sim.numQubits;
  const dim = 1 << n;
  const probs = sim.probabilities;
  if (probs.length === 0) return null;
  const ranked: Array<{ basis: string; p: number }> = [];
  for (let i = 0; i < dim; i++) {
    const p = probs[i] ?? 0;
    if (p < 1e-10) continue;
    ranked.push({ basis: i.toString(2).padStart(n, "0"), p });
  }
  ranked.sort((a, b) => b.p - a.p);
  const top = ranked.slice(0, TOPK);
  let captured = 0;
  for (const e of top) captured += e.p;
  const header = sim.isNoisy
    ? `Probabilities (trajectory-averaged, T=${sim.trajectories ?? "?"})`
    : `Probabilities (exact)`;
  return [
    `${header} — top ${top.length} of ${ranked.length} non-zero outcomes (captured Σp = ${captured.toFixed(6)})`,
    ...top.map((e) => `|${e.basis}⟩  ${e.p.toFixed(6)}`),
  ].join("\n");
}

export function serialiseBloch(sim: SimResult, circuit: Circuit): string | null {
  const bv = sim.blochVectors;
  if (!bv || bv.length === 0) return null;
  const header = sim.isNoisy
    ? `Per-qubit Bloch vectors (reduced state, trajectory-averaged):`
    : `Per-qubit Bloch vectors (reduced state):`;
  const lines = bv.map((v, q) => {
    const name = circuit.qubitNames?.[q]?.trim() || `q${q}`;
    const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return `  ${name.padEnd(10)} r = (${signed(v.x)}, ${signed(v.y)}, ${signed(v.z)})   |r| = ${r.toFixed(4)}`;
  });
  return [header, ...lines].join("\n");
}

export function serialiseResources(circuit: Circuit): string {
  const r = estimateResources(circuit);
  const lines: string[] = [
    `Resource estimate:`,
    `  total gates       ${r.totalGates}`,
    `  1-qubit           ${r.oneQubit}`,
    `  2-qubit           ${r.twoQubit}`,
    `  multi-qubit       ${r.multiQubit}`,
    `  measurements      ${r.measurements}`,
    `  parameterized     ${r.parameterized}`,
    `  CX count          ${r.cxCount}`,
    `  T-count           ${r.tCount}`,
    `  T-depth           ${r.tDepth}`,
    `  Clifford count    ${r.cliffordCount}`,
    `  parallel depth    ${r.parallelDepth}`,
    `  longest qubit     ${r.longestQubitLength}`,
    `  qubits touched    ${r.distinctQubits} / ${circuit.numQubits}`,
    `  free symbols      ${r.freeSymbols}`,
  ];
  if (r.arbitrary2q > 0) {
    lines.push(`  u_arb_2 blocks    ${r.arbitrary2q}  (≈ ${r.arbitrary2q * 3} CX + ${r.arbitrary2q * 8} 1Q via KAK)`);
  }
  return lines.join("\n");
}

export function serialiseNoise(noise: NoiseModel): string {
  if (!noise.enabled) return "Noise model: disabled (statevector path)";
  const lines = [
    `Noise model: enabled (quantum trajectories, T=${noise.trajectories})`,
    `  1q depolarising   ${noise.oneQubitDepolarising}`,
    `  2q depolarising   ${noise.twoQubitDepolarising}`,
    `  amplitude damping ${noise.amplitudeDamping}`,
    `  phase damping     ${noise.phaseDamping}`,
    `  readout bit-flip  ${noise.readoutBitFlip}`,
    `  crosstalk         ${noise.crosstalk}`,
  ];
  if (noise.source) lines.push(`  source            ${noise.source}`);
  if (noise.coupling) {
    const edges = noise.coupling.reduce((s, nbrs, i) => s + nbrs.filter((n) => n > i).length, 0);
    lines.push(`  coupling map      ${noise.coupling.length} qubits, ${edges} edges`);
  }
  if (noise.perGate && Object.keys(noise.perGate).length > 0) {
    lines.push(`  per-gate rates    ${Object.entries(noise.perGate).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  if (noise.customKraus?.enabled) lines.push(`  custom 1q Kraus   ${noise.customKraus.operators.length} operator(s)`);
  if (noise.customKraus2q?.enabled) lines.push(`  custom 2q Kraus   ${noise.customKraus2q.operators.length} operator(s)`);
  return lines.join("\n");
}

export function serialiseClassicalRegister(sim: SimResult, circuit: Circuit): string | null {
  const rec = sim.measurementRecord;
  if (!rec || rec.length === 0) return null;
  // Big-endian display matching the rest of the UI: clbit 0 leftmost.
  const bits = rec.map((v) => (v ? "1" : "0")).join("");
  const header = sim.isNoisy
    ? `Classical register (one representative trajectory; circuit has ${circuit.numClbits} clbit(s)):`
    : `Classical register (circuit has ${circuit.numClbits} clbit(s)):`;
  return `${header}\n  c = ${bits}`;
}

// ─── helpers ──────────────────────────────────────────────────────────

function fmtCx(re: number, im: number): string {
  const r = re.toFixed(4);
  const i = Math.abs(im).toFixed(4);
  const sign = im >= 0 ? "+" : "-";
  return `${r} ${sign} ${i}i`;
}

function signed(v: number): string {
  const s = v >= 0 ? "+" : "-";
  return `${s}${Math.abs(v).toFixed(4)}`;
}

/**
 * Top-level entry point. Given a set of attach keys, returns the joined
 * context block to splice into the user message (or empty string when
 * nothing selected). Order is fixed (resources → noise → statevector →
 * probabilities → Bloch → classical reg) so the model sees a consistent
 * layout.
 */
export function buildAttachedContext(
  attached: ReadonlySet<AttachKey>,
  circuit: Circuit,
  sim: SimResult | null,
  noise: NoiseModel,
): string {
  if (attached.size === 0) return "";
  const blocks: string[] = [];
  if (attached.has("resources")) blocks.push(serialiseResources(circuit));
  if (attached.has("noise")) blocks.push(serialiseNoise(noise));
  if (sim) {
    if (attached.has("statevector")) {
      const s = serialiseStatevector(sim);
      if (s) blocks.push(s);
    }
    if (attached.has("probabilities")) {
      const s = serialiseProbabilities(sim);
      if (s) blocks.push(s);
    }
    if (attached.has("bloch")) {
      const s = serialiseBloch(sim, circuit);
      if (s) blocks.push(s);
    }
    if (attached.has("classicalRegister")) {
      const s = serialiseClassicalRegister(sim, circuit);
      if (s) blocks.push(s);
    }
  }
  return blocks.join("\n\n");
}
