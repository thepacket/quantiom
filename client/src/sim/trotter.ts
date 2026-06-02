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

export type TrotterOptions = {
  /** Total Trotter steps. The circuit applies the first-order step S times. */
  steps: number;
  /** Symbolic per-step duration. Default "t" — drives the animation clock. */
  delta: string;
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

/** Build a circuit implementing `steps` first-order Trotter steps of e^{-iHδ}. */
export function buildTrotterCircuit(terms: PauliTerm[], options: TrotterOptions): Circuit {
  const n = pauliSumQubitCount(terms);
  const delta = options.delta || "t";
  const gates: PlacedGate[] = [];
  let column = 0;

  for (let s = 0; s < options.steps; s++) {
    for (const term of terms) {
      const subgates = exponentiatePauliString(term, n, delta, column);
      if (subgates.length === 0) continue;
      const lastCol = subgates.reduce((m, g) => Math.max(m, g.column), column);
      gates.push(...subgates);
      column = lastCol + 1;
      // Insert a barrier between terms within a step so the canvas shows
      // the structure clearly. Barriers also stop the optimiser from
      // commuting gates across step boundaries.
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
  }

  return {
    numQubits: n,
    numClbits: 0,
    name: options.name ?? `Trotter step (${options.steps}×)`,
    gates,
  };
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
