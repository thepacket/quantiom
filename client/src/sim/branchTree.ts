/**
 * Dynamic branch tree: enumerate the probabilistic outcome branches a circuit
 * spawns at mid-circuit measurements (and resets). Each measurement splits the
 * evolving state into the |0⟩ and |1⟩ outcome subspaces with their Born
 * probabilities; conditional gates downstream then act differently on each
 * branch. The tree is the dynamic-circuit analogue of the static probability
 * histogram — it shows *how* the classical record is built, outcome by outcome.
 *
 * A self-contained forking statevector walker (independent of `simulate`'s
 * single-trajectory loop): it reuses the same exported gate machinery
 * (`buildMatrix` + `applyKQubit`) and applies the same condition / anti-control
 * semantics, but clones-and-projects at every measurement instead of sampling
 * one outcome. Exponential in the number of measurements, so capped.
 */

import type { Circuit, PlacedGate } from "../editor/types";
import { buildMatrix, M_X, M_H, M_S, M_Sdg } from "./matrices";
import { applyKQubit } from "./apply";
import { compileExpr } from "./expr";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";

export type BranchNode = {
  /** Event label, e.g. "M q2 → c1" or "reset q0"; "root" for the start. */
  label: string;
  /** Outcome bit on the edge into this node (null at the root). */
  outcome: number | null;
  /** Conditional Born probability of this outcome given the parent branch. */
  edgeProb: number;
  /** Cumulative probability of reaching this node from the root. */
  prob: number;
  children: BranchNode[];
  /** Classical register bitstring (big-endian over numClbits) at a leaf. */
  bits?: string;
};

export type BranchTreeResult = {
  root: BranchNode;
  /** Number of branching events (measurements + resets) actually expanded. */
  events: number;
  numLeaves: number;
  /** True when the cap stopped expansion early. */
  truncated: boolean;
};

export const MAX_BRANCH_QUBITS = 12;
export const MAX_BRANCH_EVENTS = 8;
export const MAX_BRANCH_LEAVES = 256;
const PRUNE = 1e-9;

const EXPR_CACHE = new Map<string, ReturnType<typeof compileExpr>>();
function evalParam(src: string, scope: ParameterValues): number {
  let c = EXPR_CACHE.get(src);
  if (!c) { c = compileExpr(src); EXPR_CACHE.set(src, c); }
  return c.eval(scope);
}

const MEASURE_BASIS: Record<string, "Z" | "X" | "Y"> = {
  measure: "Z", measure_x: "X", measure_y: "Y",
};
const MARKERS = new Set(["barrier", "delay"]);
const SKIP = new Set(["if", "switch", "while", "box", "initialize", "init0", "init1", "initplus", "initminus", "initiplus", "initiminus"]);

type Branch = {
  state: Float64Array;
  cReg: Uint8Array;
  node: BranchNode;
};

/** P(qubit q = 1) in the computational basis. */
function marginalP1(state: Float64Array, n: number, q: number): number {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  let p = 0;
  for (let i = 0; i < dim; i++) {
    if (i & mask) { const re = state[2 * i], im = state[2 * i + 1]; p += re * re + im * im; }
  }
  return Math.max(0, Math.min(1, p));
}

/** Project onto qubit q = outcome and renormalise in place. */
function projectRenorm(state: Float64Array, n: number, q: number, outcome: number): void {
  const mask = 1 << (n - 1 - q);
  const dim = 1 << n;
  const want = outcome === 1 ? mask : 0;
  let norm2 = 0;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) === want) { const re = state[2 * i], im = state[2 * i + 1]; norm2 += re * re + im * im; }
    else { state[2 * i] = 0; state[2 * i + 1] = 0; }
  }
  const norm = Math.sqrt(norm2);
  if (norm > 1e-12) { const inv = 1 / norm; for (let i = 0; i < dim; i++) { state[2 * i] *= inv; state[2 * i + 1] *= inv; } }
}

/** Rotate the measurement basis into Z (forward) or back (inverse). */
function rotateBasis(state: Float64Array, n: number, q: number, basis: "Z" | "X" | "Y", inverse: boolean): void {
  if (basis === "Z") return;
  if (basis === "X") { applyKQubit(state, n, [q], M_H); return; }
  // Y: forward = Sdg, H ; inverse = H, S
  if (!inverse) { applyKQubit(state, n, [q], M_Sdg); applyKQubit(state, n, [q], M_H); }
  else { applyKQubit(state, n, [q], M_H); applyKQubit(state, n, [q], M_S); }
}

/** Apply a single non-branching gate to a branch's state (mirrors simulate). */
function applyGate(b: Branch, n: number, g: PlacedGate, params: number[]): void {
  if (MARKERS.has(g.gateId) || SKIP.has(g.gateId)) return;
  if (g.condition && b.cReg[g.condition.clbit] !== g.condition.value) return;
  const U = buildMatrix(g.gateId, params, g.controls.length);
  if (!U) return;
  const allQubits = [...g.controls, ...g.targets];
  const anti: number[] = [];
  if (g.controlStates) for (let i = 0; i < g.controls.length; i++) if (g.controlStates[i] === false) anti.push(g.controls[i]);
  for (const q of anti) applyKQubit(b.state, n, [q], M_X);
  applyKQubit(b.state, n, allQubits, U);
  for (const q of anti) applyKQubit(b.state, n, [q], M_X);
}

export function branchTree(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[] = [],
): BranchTreeResult | null {
  const n = circuit.numQubits;
  if (n < 1 || n > MAX_BRANCH_QUBITS) return null;

  const gates = [...expandCustomGates(circuit.gates, customGates)].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );
  const numClbits = Math.max(1, circuit.numClbits);

  const dim = 1 << n;
  const initState = new Float64Array(2 * dim);
  initState[0] = 1;
  const root: BranchNode = { label: "root", outcome: null, edgeProb: 1, prob: 1, children: [] };
  let branches: Branch[] = [{ state: initState, cReg: new Uint8Array(numClbits), node: root }];

  let events = 0;
  let truncated = false;

  for (const g of gates) {
    const basis = MEASURE_BASIS[g.gateId];
    const isReset = g.gateId === "reset";

    if (!basis && !isReset) {
      const params = g.params.map((p) => evalParam(p, paramValues));
      for (const b of branches) applyGate(b, n, g, params);
      continue;
    }

    // Branching event (measurement or reset).
    if (events >= MAX_BRANCH_EVENTS) { truncated = true; break; }
    events++;
    const q = g.targets[0];
    const clbit = basis ? g.clbits[0] : -1;
    const next: Branch[] = [];

    for (const b of branches) {
      // A conditional measurement that doesn't fire passes through unchanged.
      if (g.condition && b.cReg[g.condition.clbit] !== g.condition.value) { next.push(b); continue; }

      const work = b.state.slice();
      rotateBasis(work, n, q, basis ?? "Z", false);
      const p1 = marginalP1(work, n, q);
      const outcomes: Array<{ o: number; p: number }> = [
        { o: 0, p: 1 - p1 },
        { o: 1, p: p1 },
      ];

      for (const { o, p } of outcomes) {
        const childProb = b.node.prob * p;
        if (childProb < PRUNE) continue;
        const cs = work.slice();
        projectRenorm(cs, n, q, o);
        rotateBasis(cs, n, q, basis ?? "Z", true);
        const cReg = b.cReg.slice();
        if (basis) cReg[clbit] = o as 0 | 1;
        else if (o === 1) applyKQubit(cs, n, [q], M_X); // reset: |1⟩ → |0⟩
        const child: BranchNode = {
          label: basis ? `M q${q}${clbit >= 0 ? ` → c${clbit}` : ""}` : `reset q${q}`,
          outcome: o,
          edgeProb: p,
          prob: childProb,
          children: [],
        };
        b.node.children.push(child);
        next.push({ state: cs, cReg, node: child });
      }
    }
    branches = next;
    if (branches.length > MAX_BRANCH_LEAVES) { truncated = true; break; }
  }

  // Annotate leaves with their classical bitstring.
  for (const b of branches) {
    let s = "";
    for (let c = 0; c < numClbits; c++) s += b.cReg[c];
    b.node.bits = s;
  }

  return { root, events, numLeaves: branches.length, truncated };
}
