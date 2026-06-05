/**
 * Custom-gate expansion. expandCustomGates inlines a saved block's body into
 * the outer circuit, remapping the body's local qubit indices onto the
 * placement's qubits and offsetting columns. It must recurse (a custom gate
 * built from other custom gates), skip unknown references, and stay bounded
 * against accidental self-reference.
 */
import { describe, test, expect } from "vitest";
import { expandCustomGates, CUSTOM_PREFIX, type CustomGate } from "../src/editor/customGates";
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
});
