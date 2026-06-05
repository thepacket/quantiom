/**
 * Custom-gate expansion. expandCustomGates inlines a saved block's body into
 * the outer circuit, remapping the body's local qubit indices onto the
 * placement's qubits and offsetting columns. It must recurse (a custom gate
 * built from other custom gates), skip unknown references, and stay bounded
 * against accidental self-reference.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  expandCustomGates,
  loadCustomGates,
  saveCustomGates,
  newCustomGateId,
  CUSTOM_PREFIX,
  type CustomGate,
} from "../src/editor/customGates";
import { gate } from "./helpers";
import type { PlacedGate } from "../src/editor/types";

/** A 2-qubit Bell block on local qubits 0,1. */
const bell: CustomGate = {
  id: "bell",
  name: "Bell",
  numQubits: 2,
  gates: [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)],
};

function ref(id: string, qubits: number[], column = 0): PlacedGate {
  return { ...gate(CUSTOM_PREFIX + id, qubits, [], [], column) };
}

describe("expandCustomGates", () => {
  test("inlines a block, remapping local qubits to the placement qubits", () => {
    const out = expandCustomGates([ref("bell", [2, 3])], [bell]);
    expect(out.map((g) => g.gateId)).toEqual(["h", "cx"]);
    // local 0→2, local 1→3.
    expect(out[0].targets).toEqual([2]);
    expect(out[1].targets).toEqual([3]);
    expect(out[1].controls).toEqual([2]);
  });

  test("offsets inner columns by the placement column", () => {
    const out = expandCustomGates([ref("bell", [0, 1], 5)], [bell]);
    expect(out.map((g) => g.column)).toEqual([5, 6]);
  });

  test("plain gates pass through untouched alongside references", () => {
    const out = expandCustomGates([gate("x", [0]), ref("bell", [0, 1])], [bell]);
    expect(out.map((g) => g.gateId)).toEqual(["x", "h", "cx"]);
  });

  test("recurses through a block that references another block", () => {
    const doubleBell: CustomGate = {
      id: "db",
      name: "DoubleBell",
      numQubits: 3,
      // a Bell on (0,1) then another on (1,2).
      gates: [ref("bell", [0, 1], 0), ref("bell", [1, 2], 2)],
    };
    const out = expandCustomGates([ref("db", [0, 1, 2])], [bell, doubleBell]);
    expect(out.map((g) => g.gateId)).toEqual(["h", "cx", "h", "cx"]);
    expect(out[1].controls).toEqual([0]);
    expect(out[3].controls).toEqual([1]); // second Bell remapped onto (1,2)
  });

  test("unknown custom reference is silently skipped", () => {
    const out = expandCustomGates([gate("x", [0]), ref("ghost", [0, 1])], [bell]);
    expect(out.map((g) => g.gateId)).toEqual(["x"]);
  });

  test("self-referential block terminates (depth bound) instead of hanging", () => {
    const loop: CustomGate = { id: "loop", name: "Loop", numQubits: 1, gates: [ref("loop", [0])] };
    const out = expandCustomGates([ref("loop", [0])], [loop]);
    expect(out).toEqual([]); // bottoms out at the depth cap with no plain gates
  });

  test("carries clbits, params, controlStates and conditions onto inlined gates", () => {
    const block: CustomGate = {
      id: "blk",
      name: "Blk",
      numQubits: 2,
      gates: [
        {
          ...gate("cx", [1], [0], [], 0),
          controlStates: [false],
          condition: { clbit: 0, value: 1 },
          clbits: [0],
        },
      ],
    };
    const out = expandCustomGates([ref("blk", [3, 4])], [block]);
    expect(out[0].controlStates).toEqual([false]);
    expect(out[0].condition).toEqual({ clbit: 0, value: 1 });
    expect(out[0].clbits).toEqual([0]);
    // local 0→3, local 1→4.
    expect(out[0].controls).toEqual([3]);
    expect(out[0].targets).toEqual([4]);
  });

  test("an inner qubit index past the placement mapping falls back to itself", () => {
    // The block declares 1 qubit but its body touches local qubit 2 (malformed,
    // but the remap must not crash — it falls back to the raw index).
    const odd: CustomGate = {
      id: "odd",
      name: "Odd",
      numQubits: 1,
      gates: [gate("x", [2], [], [], 0)],
    };
    const out = expandCustomGates([ref("odd", [5])], [odd]);
    expect(out[0].targets).toEqual([2]); // mapping[2] is undefined → keeps 2
  });
});

describe("custom-gate persistence", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const sample: CustomGate = { id: "s1", name: "Bell", numQubits: 2, gates: [gate("h", [0])] };

  test("save then load round-trips the registry", () => {
    saveCustomGates([sample]);
    expect(loadCustomGates()).toEqual([sample]);
  });

  test("empty storage yields an empty registry", () => {
    expect(loadCustomGates()).toEqual([]);
  });

  test("a non-array stored value is ignored", () => {
    store["quantiom:custom-gates:v1"] = JSON.stringify({ not: "an array" });
    expect(loadCustomGates()).toEqual([]);
  });

  test("corrupted JSON is swallowed and yields []", () => {
    store["quantiom:custom-gates:v1"] = "{not valid json";
    expect(loadCustomGates()).toEqual([]);
  });

  test("save swallows storage errors instead of throwing", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => { throw new Error("quota exceeded"); },
      getItem: () => null,
    };
    expect(() => saveCustomGates([sample])).not.toThrow();
  });
});

describe("newCustomGateId", () => {
  test("is a non-empty 'cg'-prefixed string, distinct per call", () => {
    const a = newCustomGateId();
    const b = newCustomGateId();
    expect(a).toMatch(/^cg/);
    expect(a).not.toBe(b);
  });
});
