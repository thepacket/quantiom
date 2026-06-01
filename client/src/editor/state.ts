import { useCallback, useReducer } from "react";
import type { Circuit, PlacedGate } from "./types";
import { GATES_BY_ID, totalQubits } from "./gates";

const INITIAL: Circuit = {
  numQubits: 5,
  numClbits: 2,
  gates: [],
};

export type Action =
  | { type: "add-qubit" }
  | { type: "remove-qubit" }
  | { type: "add-clbit" }
  | { type: "remove-clbit" }
  | { type: "place-gate"; gate: PlacedGate }
  | { type: "remove-gate"; id: string }
  | { type: "update-gate"; id: string; patch: Partial<PlacedGate> }
  | { type: "move-gate"; id: string; column: number; anchorQubit: number }
  | { type: "replace-circuit"; circuit: Circuit }
  | { type: "clear" };

export type HistoryAction = Action | { type: "undo" } | { type: "redo" };

function reducer(state: Circuit, action: Action): Circuit {
  switch (action.type) {
    case "add-qubit":
      return { ...state, numQubits: state.numQubits + 1 };
    case "remove-qubit": {
      if (state.numQubits <= 1) return state;
      const last = state.numQubits - 1;
      const gates = state.gates.filter(
        (g) => !g.controls.includes(last) && !g.targets.includes(last),
      );
      return { ...state, numQubits: last, gates };
    }
    case "add-clbit":
      return { ...state, numClbits: state.numClbits + 1 };
    case "remove-clbit": {
      if (state.numClbits <= 0) return state;
      const last = state.numClbits - 1;
      const gates = state.gates.filter((g) => !g.clbits.includes(last));
      return { ...state, numClbits: last, gates };
    }
    case "place-gate": {
      const placed = relocateIfCollision(state.gates, action.gate);
      return { ...state, gates: [...state.gates, placed] };
    }
    case "remove-gate":
      return { ...state, gates: state.gates.filter((g) => g.id !== action.id) };
    case "update-gate":
      return {
        ...state,
        gates: state.gates.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };
    case "move-gate": {
      const g = state.gates.find((x) => x.id === action.id);
      if (!g) return state;
      const all = [...g.controls, ...g.targets];
      if (all.length === 0) return state;
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      let shift = action.anchorQubit - lo;
      if (lo + shift < 0) shift = -lo;
      if (hi + shift >= state.numQubits) shift = state.numQubits - 1 - hi;
      const without = state.gates.filter((x) => x.id !== g.id);
      const moved: PlacedGate = {
        ...g,
        column: action.column,
        controls: g.controls.map((q) => q + shift),
        targets: g.targets.map((q) => q + shift),
      };
      const placed = relocateIfCollision(without, moved);
      return { ...state, gates: [...without, placed] };
    }
    case "replace-circuit":
      return action.circuit;
    case "clear":
      return { ...state, gates: [] };
  }
}

function collides(a: PlacedGate, b: PlacedGate): boolean {
  if (a.column !== b.column) return false;
  const aw = qubitSpan(a);
  const bw = qubitSpan(b);
  return aw.some((q) => bw.includes(q));
}

/** All qubit indices a gate occupies, including the vertical span between min and max. */
export function qubitSpan(g: PlacedGate): number[] {
  const qs = [...g.controls, ...g.targets];
  if (qs.length === 0) return [];
  const lo = Math.min(...qs);
  const hi = Math.max(...qs);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function relocateIfCollision(existing: PlacedGate[], gate: PlacedGate): PlacedGate {
  let col = gate.column;
  while (existing.some((e) => collides(e, { ...gate, column: col }))) col += 1;
  return { ...gate, column: col };
}

// ─── History wrapper ───────────────────────────────────────────────────────

const MAX_HISTORY = 100;

type Versioned = {
  past: Circuit[];
  present: Circuit;
  future: Circuit[];
};

function historyReducer(v: Versioned, action: HistoryAction): Versioned {
  if (action.type === "undo") {
    if (v.past.length === 0) return v;
    const prev = v.past[v.past.length - 1];
    return { past: v.past.slice(0, -1), present: prev, future: [v.present, ...v.future] };
  }
  if (action.type === "redo") {
    if (v.future.length === 0) return v;
    const next = v.future[0];
    return { past: [...v.past, v.present], present: next, future: v.future.slice(1) };
  }
  const next = reducer(v.present, action);
  if (next === v.present) return v;
  const past = [...v.past, v.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [] };
}

const INITIAL_VERSIONED: Versioned = { past: [], present: INITIAL, future: [] };

export function useCircuit() {
  const [versioned, raw] = useReducer(historyReducer, INITIAL_VERSIONED);
  const dispatch = useCallback((a: HistoryAction) => raw(a), [raw]);
  return [versioned.present, dispatch, { canUndo: versioned.past.length > 0, canRedo: versioned.future.length > 0 }] as const;
}

let nextId = 1;
export function newGateId(): string {
  return `g${nextId++}`;
}

/** Build a fresh PlacedGate from a gate definition and qubit assignment. */
export function buildPlacedGate(
  gateId: string,
  column: number,
  qubits: number[],
  clbits: number[] = [],
): PlacedGate {
  const def = GATES_BY_ID[gateId];
  const need = totalQubits(def);
  if (qubits.length !== need) {
    throw new Error(`gate ${gateId} expects ${need} qubits, got ${qubits.length}`);
  }
  return {
    id: newGateId(),
    gateId,
    column,
    controls: qubits.slice(0, def.numControls),
    targets: qubits.slice(def.numControls),
    clbits,
    params: def.params.map((p) => p.default),
  };
}
