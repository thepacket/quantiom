import { useReducer } from "react";
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
  | { type: "clear" };

function reducer(state: Circuit, action: Action): Circuit {
  switch (action.type) {
    case "add-qubit":
      return { ...state, numQubits: state.numQubits + 1 };
    case "remove-qubit": {
      if (state.numQubits <= 1) return state;
      const last = state.numQubits - 1;
      // drop any gate that touches the removed qubit
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

export function useCircuit() {
  return useReducer(reducer, INITIAL);
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
