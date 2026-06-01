/**
 * User-defined composite gates. The current circuit can be "saved as a
 * gate" — it becomes a single tile in the palette and a single block on
 * the canvas. At simulation time the block expands inline to its
 * constituent gates with the outer-placement qubits substituted for the
 * sub-circuit's local qubit indices.
 *
 * Persistence: localStorage key `quantiom:custom-gates:v1`. The
 * registry survives reloads and is shared across all circuits in this
 * browser.
 */

import type { PlacedGate } from "./types";

const STORAGE_KEY = "quantiom:custom-gates:v1";

export type CustomGate = {
  id: string;
  name: string;
  numQubits: number;
  /** The inner body — gates relative to local qubits 0..numQubits-1. */
  gates: PlacedGate[];
};

export const CUSTOM_PREFIX = "custom:";

export function loadCustomGates(): CustomGate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveCustomGates(gates: CustomGate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gates));
  } catch {
    /* ignore */
  }
}

/** Generate a fresh registry id (independent from per-instance gate ids). */
export function newCustomGateId(): string {
  return "cg" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

/** Recursively expand custom-gate references in a gate list to plain gates. */
export function expandCustomGates(
  gates: PlacedGate[],
  registry: CustomGate[],
  depth = 0,
): PlacedGate[] {
  if (depth > 16) return []; // bound against accidental recursion
  const out: PlacedGate[] = [];
  let idCounter = 0;
  const freshId = () => `xp${depth}_${idCounter++}`;

  for (const g of gates) {
    if (g.gateId.startsWith(CUSTOM_PREFIX)) {
      const localId = g.gateId.slice(CUSTOM_PREFIX.length);
      const def = registry.find((c) => c.id === localId);
      if (!def) continue; // unknown custom — silently skip
      const mapping = [...g.controls, ...g.targets];
      const offsetCol = g.column;
      const remapped = def.gates.map<PlacedGate>((inner) => ({
        id: freshId(),
        gateId: inner.gateId,
        column: offsetCol + inner.column,
        controls: inner.controls.map((q) => mapping[q] ?? q),
        targets: inner.targets.map((q) => mapping[q] ?? q),
        clbits: inner.clbits,
        params: inner.params,
        controlStates: inner.controlStates,
        condition: inner.condition,
      }));
      const expanded = expandCustomGates(remapped, registry, depth + 1);
      out.push(...expanded);
    } else {
      out.push(g);
    }
  }
  return out;
}
