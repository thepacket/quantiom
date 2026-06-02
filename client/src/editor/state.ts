import { useCallback, useEffect, useReducer } from "react";
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
  | { type: "reassign-qubit"; id: string; role: "controls" | "targets"; index: number; newQubit: number }
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
    case "reassign-qubit": {
      const g = state.gates.find((x) => x.id === action.id);
      if (!g) return state;
      if (action.newQubit < 0 || action.newQubit >= state.numQubits) return state;
      const updated = { ...g, [action.role]: [...g[action.role]] } as PlacedGate;
      updated[action.role][action.index] = action.newQubit;
      // Reject if any qubit ends up assigned to more than one role.
      const combined = [...updated.controls, ...updated.targets];
      const seen = new Set<number>();
      for (const q of combined) {
        if (seen.has(q)) return state;
        seen.add(q);
      }
      const without = state.gates.filter((x) => x.id !== g.id);
      const placed = relocateIfCollision(without, updated);
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
const COALESCE_MS = 500;

export type Versioned = {
  past: Circuit[];
  present: Circuit;
  future: Circuit[];
  /** Last action's coalesce key and timestamp. New same-key actions within
   * COALESCE_MS update `present` without pushing a new entry to `past`. */
  coalesce: { key: string; at: number } | null;
};

/** Returns a stable key when an action should coalesce with its predecessor.
 *
 * Typing into a single inspector field shouldn't generate one history entry
 * per keystroke; we group them by gate id. Replace-circuit from the QASM
 * editor coalesces similarly so a multi-character text edit is one undo step.
 */
function coalesceKey(action: HistoryAction): string | null {
  if (action.type === "update-gate") return `update-gate:${action.id}`;
  if (action.type === "replace-circuit") return "replace-circuit";
  return null;
}

function historyReducer(v: Versioned, action: HistoryAction): Versioned {
  if (action.type === "undo") {
    if (v.past.length === 0) return v;
    const prev = v.past[v.past.length - 1];
    return {
      past: v.past.slice(0, -1),
      present: prev,
      future: [v.present, ...v.future],
      coalesce: null,
    };
  }
  if (action.type === "redo") {
    if (v.future.length === 0) return v;
    const next = v.future[0];
    return {
      past: [...v.past, v.present],
      present: next,
      future: v.future.slice(1),
      coalesce: null,
    };
  }
  const next = reducer(v.present, action);
  if (next === v.present) return v;

  const key = coalesceKey(action);
  const now = Date.now();
  const shouldCoalesce =
    key !== null && v.coalesce !== null && v.coalesce.key === key && now - v.coalesce.at < COALESCE_MS;

  if (shouldCoalesce) {
    // Replace present only — keep past unchanged so undo jumps to the pre-typing snapshot.
    return { past: v.past, present: next, future: [], coalesce: { key, at: now } };
  }
  const past = [...v.past, v.present];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, present: next, future: [], coalesce: key ? { key, at: now } : null };
}

const INITIAL_VERSIONED: Versioned = { past: [], present: INITIAL, future: [], coalesce: null };

/** Exposed for the multi-tab module (editor/tabs.ts) to compose. */
export const initialVersioned = INITIAL_VERSIONED;
export const historyReducerExport = historyReducer;

const STORAGE_KEY = "quantiom:circuit:v1";

function loadFromStorage(): Versioned {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_VERSIONED;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.numQubits === "number" &&
      Array.isArray(parsed.gates)
    ) {
      return { ...INITIAL_VERSIONED, present: parsed as Circuit };
    }
  } catch {
    /* corrupted entry — ignore */
  }
  return INITIAL_VERSIONED;
}

export function useCircuit() {
  const [versioned, raw] = useReducer(historyReducer, INITIAL_VERSIONED, loadFromStorage);
  const dispatch = useCallback((a: HistoryAction) => raw(a), [raw]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(versioned.present));
    } catch {
      /* storage may be unavailable — fail quietly */
    }
  }, [versioned.present]);
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
  const controls = qubits.slice(0, def.numControls);
  return {
    id: newGateId(),
    gateId,
    column,
    controls,
    targets: qubits.slice(def.numControls),
    clbits,
    params: def.params.map((p) => p.default),
    controlStates: controls.length > 0 ? controls.map(() => true) : undefined,
  };
}
