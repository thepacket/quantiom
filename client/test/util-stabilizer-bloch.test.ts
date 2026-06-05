import { describe, test, expect } from "vitest";
import { runClifford, runCliffordNoisy } from "../src/sim/stabilizer";
import { mulberry32 } from "../src/sim/measure";
import type { PlacedGate } from "../src/editor/types";
import { gate } from "./helpers";

const bloch = (n: number, gates: PlacedGate[]) => runClifford(n, gates).tab.blochVectors();

describe("Stabilizer.blochVectors — single-qubit reductions", () => {
  test("|0⟩ points to +Z", () => {
    expect(bloch(1, [])[0]).toEqual({ x: 0, y: 0, z: 1 });
  });
  test("|1⟩ (X) points to −Z", () => {
    expect(bloch(1, [gate("x", [0])])[0]).toEqual({ x: 0, y: 0, z: -1 });
  });
  test("|+⟩ (H) points to +X, |−⟩ (H·Z) to −X", () => {
    expect(bloch(1, [gate("h", [0])])[0]).toEqual({ x: 1, y: 0, z: 0 });
    expect(bloch(1, [gate("h", [0]), gate("z", [0])])[0]).toEqual({ x: -1, y: 0, z: 0 });
  });
  test("|+i⟩ (S·H) points to +Y, |−i⟩ (Sdg·H) to −Y", () => {
    expect(bloch(1, [gate("h", [0]), gate("s", [0])])[0]).toEqual({ x: 0, y: 1, z: 0 });
    expect(bloch(1, [gate("h", [0]), gate("sdg", [0])])[0]).toEqual({ x: 0, y: -1, z: 0 });
  });
  test("a Bell pair's single-qubit marginals are maximally mixed (Bloch 0)", () => {
    const b = bloch(2, [gate("h", [0]), gate("cx", [1], [0])]);
    expect(b[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(b[1]).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("runCliffordNoisy — frame propagation rules (zero noise)", () => {
  test("sx/sxdg/sdg/cy/cz/swap/reset propagate without injecting errors", () => {
    const gates: PlacedGate[] = [
      gate("sx", [0]), gate("sxdg", [0]), gate("sdg", [0]), gate("s", [0]),
      gate("cy", [1], [0]), gate("cz", [1], [0]), gate("swap", [0, 1]),
      gate("reset", [0]), { ...gate("measure", [0]), clbits: [0] },
    ];
    const r = runCliffordNoisy(2, gates, mulberry32(7), 1, {
      oneQubitDepolarising: 0, twoQubitDepolarising: 0,
    });
    // With zero depolarising rate the Pauli frame stays identity throughout.
    expect(Array.from(r.frame).every((b) => b === 0)).toBe(true);
    expect(r.classical).toHaveLength(1);
  });

  test("noiseless tableau path and noisy frame path agree on a deterministic circuit", () => {
    // X then Z-measure ⇒ outcome 1 deterministically; both engines must match.
    const gates: PlacedGate[] = [gate("x", [0]), { ...gate("measure", [0]), clbits: [0] }];
    const clean = runClifford(1, gates, mulberry32(3), 1).classical;
    const noisy = runCliffordNoisy(1, gates, mulberry32(3), 1, {
      oneQubitDepolarising: 0, twoQubitDepolarising: 0,
    }).classical;
    expect(noisy[0]).toBe(clean[0]);
    expect(noisy[0]).toBe(1);
  });
});

describe("runClifford — rejects a non-Clifford gate", () => {
  test("a T gate trips the unhandled-gate guard", () => {
    expect(() => runClifford(1, [gate("t", [0])])).toThrow(/unhandled gate/);
  });
});
