import type { Circuit, PlacedGate } from "../editor/types";
import { newGateId } from "../editor/state";

/**
 * Hamiltonian Trotter / QDrift circuit builder.
 *
 * Accepts a Pauli-sum Hamiltonian as text — `0.5 * II + 0.3 * XX - 0.2 * YZ`
 * — and emits a circuit that approximates e^{-iHδ} via Trotterisation.
 *
 * First-order Trotter:
 *   e^{-iHδ} ≈ Π_k e^{-i h_k P_k δ}     applied in order.
 *
 * Each term e^{-i h P δ} on a multi-qubit Pauli string P decomposes into:
 *   • basis change on each qubit (X-qubit: H; Y-qubit: S† H; Z-qubit: id)
 *   • CNOT staircase to the last non-identity qubit
 *   • RZ(2 h δ) on that qubit
 *   • undo staircase
 *   • undo basis change
 *
 * Single-qubit Paulis short-circuit to RX/RY/RZ directly.
 *
 * Pauli strings are big-endian: the first character is qubit 0.
 */

export type PauliTerm = { coefficient: number; paulis: string };

export type TrotterOrder = 1 | 2 | 4;
export type TrotterMode = "trotter" | "qdrift";

export type TrotterOptions = {
  /** Total Trotter steps. The circuit applies the elementary step S times. */
  steps: number;
  /** Symbolic per-step duration. Default "t" — drives the animation clock. */
  delta: string;
  /**
   * Splitting order:
   *   • 1 — first-order Trotter (default).
   *   • 2 — second-order symmetric Strang splitting.
   *   • 4 — fourth-order Suzuki, nested 5× second-order.
   */
  order?: TrotterOrder;
  /**
   * Compilation mode:
   *   • "trotter" — deterministic product formula (default).
   *   • "qdrift" — Campbell 2019 random compiler: per step, sample N
   *     terms proportional to |h_k|, apply each as a Rz rotation of
   *     angle 2·λ·δ/N where λ = Σ|h_k|. Stochastic — every Generate
   *     emits a different circuit.
   */
  mode?: TrotterMode;
  /** QDrift sample count per step. Default 32. */
  samples?: number;
  /** Optional name override; otherwise inferred from the source. */
  name?: string;
};

const VALID_PAULI = /^[IXYZ]+$/;

export function parsePauliSum(text: string): PauliTerm[] {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return [];
  // Split into signed terms — find every `+` or `-` that's at the start or
  // immediately after an operator/digit/letter and isn't part of an exponent.
  const out: PauliTerm[] = [];
  let i = 0;
  let n = 0;
  let sign = 1;
  while (i < compact.length) {
    // Read sign.
    if (compact[i] === "+") { sign = 1; i++; continue; }
    if (compact[i] === "-") { sign = -1; i++; continue; }
    // Read coefficient (optional).
    let coefStr = "";
    while (i < compact.length && /[0-9.eE]/.test(compact[i])) { coefStr += compact[i]; i++; }
    let coef = coefStr ? parseFloat(coefStr) : 1;
    if (!Number.isFinite(coef)) throw new Error(`bad coefficient "${coefStr}"`);
    coef *= sign;
    sign = 1;
    // Optional `*`.
    if (compact[i] === "*") i++;
    // Read Pauli string.
    let pauli = "";
    while (i < compact.length && /[IXYZ]/i.test(compact[i])) { pauli += compact[i].toUpperCase(); i++; }
    if (!pauli) throw new Error(`expected Pauli string near position ${i}`);
    if (!VALID_PAULI.test(pauli)) throw new Error(`invalid Pauli string "${pauli}"`);
    if (n === 0) n = pauli.length;
    else if (pauli.length !== n) {
      throw new Error(`Pauli string "${pauli}" has length ${pauli.length}, expected ${n}`);
    }
    out.push({ coefficient: coef, paulis: pauli });
  }
  if (out.length === 0) throw new Error("no terms parsed");
  return out;
}

export function pauliSumQubitCount(terms: PauliTerm[]): number {
  return terms.length > 0 ? terms[0].paulis.length : 0;
}

/** Build a circuit implementing the requested splitting of e^{-iHδ}. */
export function buildTrotterCircuit(terms: PauliTerm[], options: TrotterOptions): Circuit {
  const n = pauliSumQubitCount(terms);
  const delta = options.delta || "t";
  const order: TrotterOrder = options.order ?? 1;
  const mode: TrotterMode = options.mode ?? "trotter";
  const gates: PlacedGate[] = [];
  let column = 0;

  const labelBits: string[] = [];
  labelBits.push(`${options.steps}×`);
  if (mode === "qdrift") labelBits.push(`QDrift N=${options.samples ?? 32}`);
  else labelBits.push(`order ${order}`);
  const defaultName = `Trotter (${labelBits.join(", ")})`;

  for (let s = 0; s < options.steps; s++) {
    if (mode === "qdrift") {
      column = appendQDrift(gates, terms, n, delta, options.samples ?? 32, column);
    } else if (order === 1) {
      column = appendFirstOrder(gates, terms, n, delta, "1", column);
    } else if (order === 2) {
      column = appendSecondOrder(gates, terms, n, delta, "1", column);
    } else {
      column = appendFourthOrder(gates, terms, n, delta, column);
    }
    // Barrier between steps so the canvas shows the structure.
    gates.push({
      id: newGateId(),
      gateId: "barrier",
      column,
      controls: [],
      targets: Array.from({ length: n }, (_, i) => i),
      clbits: [],
      params: [],
    });
    column++;
  }

  return {
    numQubits: n,
    numClbits: 0,
    name: options.name ?? defaultName,
    gates,
  };
}

/** Append the forward sweep Π_k e^{-i h_k P_k δ·scale}, returning the next column. */
function appendFirstOrder(
  gates: PlacedGate[],
  terms: PauliTerm[],
  n: number,
  delta: string,
  scale: string,
  startColumn: number,
): number {
  let column = startColumn;
  for (const term of terms) {
    const scaledTerm: PauliTerm = scale === "1"
      ? term
      : { coefficient: term.coefficient, paulis: term.paulis };
    const effectiveDelta = scale === "1" ? delta : `(${scale})*(${delta})`;
    const subgates = exponentiatePauliString(scaledTerm, n, effectiveDelta, column);
    if (subgates.length === 0) continue;
    const lastCol = subgates.reduce((m, g) => Math.max(m, g.column), column);
    gates.push(...subgates);
    column = lastCol + 1;
  }
  return column;
}

/** Append the reverse sweep (terms in reverse order) — used by Strang. */
function appendReverseOrder(
  gates: PlacedGate[],
  terms: PauliTerm[],
  n: number,
  delta: string,
  scale: string,
  startColumn: number,
): number {
  return appendFirstOrder(gates, [...terms].reverse(), n, delta, scale, startColumn);
}

/** Symmetric Strang splitting: Π e^{-i h_k P_k δ/2} · Π_reverse e^{-i h_k P_k δ/2}. */
function appendSecondOrder(
  gates: PlacedGate[],
  terms: PauliTerm[],
  n: number,
  delta: string,
  scale: string,
  startColumn: number,
): number {
  const half = scale === "1" ? "1/2" : `(${scale})/2`;
  let column = appendFirstOrder(gates, terms, n, delta, half, startColumn);
  column = appendReverseOrder(gates, terms, n, delta, half, column);
  return column;
}

/**
 * Suzuki fourth-order: U₄(δ) = U₂(α δ)² · U₂((1-4α) δ) · U₂(α δ)²
 * with α = 1 / (4 − 4^(1/3)) ≈ 0.4145.
 */
function appendFourthOrder(
  gates: PlacedGate[],
  terms: PauliTerm[],
  n: number,
  delta: string,
  startColumn: number,
): number {
  const alpha = "0.4144907717943757";          // 1 / (4 - 4^(1/3))
  const oneMinus4Alpha = "-0.6579630807919028"; // 1 - 4·alpha
  let column = startColumn;
  column = appendSecondOrder(gates, terms, n, delta, alpha, column);
  column = appendSecondOrder(gates, terms, n, delta, alpha, column);
  column = appendSecondOrder(gates, terms, n, delta, oneMinus4Alpha, column);
  column = appendSecondOrder(gates, terms, n, delta, alpha, column);
  column = appendSecondOrder(gates, terms, n, delta, alpha, column);
  return column;
}

/**
 * QDrift step. Given Σ h_k P_k with λ = Σ|h_k|, sample `samples` terms
 * weighted by |h_k|/λ. Each sampled term becomes a rotation about its
 * Pauli with angle τ = 2·λ·δ / samples (signed by sgn(h_k)).
 */
function appendQDrift(
  gates: PlacedGate[],
  terms: PauliTerm[],
  n: number,
  delta: string,
  samples: number,
  startColumn: number,
): number {
  const weights = terms.map((t) => Math.abs(t.coefficient));
  const lambda = weights.reduce((a, b) => a + b, 0);
  if (lambda === 0) return startColumn;
  const cum: number[] = [];
  let acc = 0;
  for (const w of weights) { acc += w / lambda; cum.push(acc); }
  // Effective rotation per sample is 2λδ/N (signed by sgn(h_k)).
  // exponentiatePauliString() already inserts a factor of 2, so we pass
  // λδ/N — the doubling makes the on-circuit Rz angle the right 2λδ/N.
  const tauMag = `${formatNumber(lambda / samples)}*${delta}`;
  let column = startColumn;
  for (let s = 0; s < samples; s++) {
    const r = Math.random();
    let idx = 0;
    while (idx < cum.length && r > cum[idx]) idx++;
    if (idx >= terms.length) idx = terms.length - 1;
    const term = terms[idx];
    const sign = term.coefficient >= 0 ? "" : "-";
    const angle = `${sign}${tauMag}`;
    const synthetic: PauliTerm = { coefficient: 1, paulis: term.paulis };
    const subgates = exponentiatePauliString(synthetic, n, angle, column);
    if (subgates.length === 0) continue;
    const lastCol = subgates.reduce((m, g) => Math.max(m, g.column), column);
    gates.push(...subgates);
    column = lastCol + 1;
  }
  return column;
}

/** Emit gates implementing e^{-i h P δ} on a multi-qubit Pauli string. */
function exponentiatePauliString(
  term: PauliTerm,
  n: number,
  delta: string,
  startColumn: number,
): PlacedGate[] {
  const { coefficient: h, paulis } = term;
  if (h === 0) return [];

  // Identify the active qubits (those with non-I Pauli) and their types.
  const active: Array<{ q: number; p: "X" | "Y" | "Z" }> = [];
  for (let q = 0; q < n; q++) {
    const p = paulis[q];
    if (p === "I") continue;
    active.push({ q, p: p as "X" | "Y" | "Z" });
  }
  if (active.length === 0) return []; // pure identity — just a global phase.

  // Single-qubit shortcut.
  if (active.length === 1) {
    const { q, p } = active[0];
    const angle = trigParam(h, delta);
    let gateId: string;
    if (p === "X") gateId = "rx";
    else if (p === "Y") gateId = "ry";
    else gateId = "rz";
    return [
      {
        id: newGateId(),
        gateId,
        column: startColumn,
        controls: [],
        targets: [q],
        clbits: [],
        params: [angle],
      },
    ];
  }

  // Multi-qubit Pauli string. Basis-change to Z, CNOT staircase, RZ, undo.
  const gates: PlacedGate[] = [];
  const pre: PlacedGate[] = [];
  const post: PlacedGate[] = [];
  let col = startColumn;
  for (const { q, p } of active) {
    if (p === "X") {
      pre.push(make("h", col, q));
      post.unshift(make("h", col, q));
    } else if (p === "Y") {
      pre.push(make("sdg", col, q));
      pre.push(make("h", col, q));
      post.unshift(make("s", col, q));
      post.unshift(make("h", col, q));
    }
    // Z: nothing.
  }
  for (const g of pre) gates.push(g);
  col++;

  // CNOT staircase: link active[0] → active[1] → … → active[k-1].
  const qubits = active.map((a) => a.q);
  for (let i = 0; i < qubits.length - 1; i++) {
    gates.push(makeCx(col, qubits[i], qubits[i + 1]));
    col++;
  }

  // RZ on last active qubit.
  const last = qubits[qubits.length - 1];
  gates.push({
    id: newGateId(),
    gateId: "rz",
    column: col,
    controls: [],
    targets: [last],
    clbits: [],
    params: [trigParam(h, delta)],
  });
  col++;

  // Reverse staircase.
  for (let i = qubits.length - 2; i >= 0; i--) {
    gates.push(makeCx(col, qubits[i], qubits[i + 1]));
    col++;
  }

  // Undo basis change.
  for (const g of post) gates.push({ ...g, column: col });
  return gates;
}

function make(gateId: string, column: number, q: number): PlacedGate {
  return { id: newGateId(), gateId, column, controls: [], targets: [q], clbits: [], params: [] };
}
function makeCx(column: number, control: number, target: number): PlacedGate {
  return {
    id: newGateId(),
    gateId: "cx",
    column,
    controls: [control],
    targets: [target],
    clbits: [],
    params: [],
  };
}

/** Build the symbolic parameter expression `2·h·δ`. */
function trigParam(h: number, delta: string): string {
  if (h === 1) return `2*${delta}`;
  if (h === -1) return `-2*${delta}`;
  // Number-format the coefficient — short form when possible.
  const hStr = formatNumber(h);
  return `${hStr}*2*${delta}`;
}

function formatNumber(x: number): string {
  if (x === Math.floor(x)) return x.toString();
  const fixed = x.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return fixed;
}
