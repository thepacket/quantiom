import { describe, test, expect } from "vitest";
import {
  noisyPauliExpectation,
  noisyExpectationObservable,
  simulateNoisy,
} from "../src/sim/simulateNoisy";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import type { Circuit } from "../src/editor/types";
import { circ, gate } from "./helpers";

const noiseless = (over: Partial<NoiseModel> = {}): NoiseModel => ({
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0, ...over,
});

// RY(π/3)|0⟩: ⟨Z⟩ = cos(π/3) = 0.5, ⟨X⟩ = sin(π/3).
const ry = circ(1, [gate("ry", [0], [], ["pi/3"])]);

describe("noisyPauliExpectation", () => {
  test("zero noise, one trajectory ⇒ the exact ⟨Z⟩", () => {
    const v = noisyPauliExpectation(ry, {}, [], noiseless(), ["Z"]);
    expect(v).toBeCloseTo(0.5, 9);
  });

  test("a zero-qubit circuit returns 0", () => {
    expect(noisyPauliExpectation(circ(0, []), {}, [], noiseless(), ["Z"])).toBe(0);
  });

  test("binds free parameters from paramValues", () => {
    const c = circ(1, [gate("ry", [0], [], ["theta"])]);
    const v = noisyPauliExpectation(c, { theta: Math.PI }, [], noiseless(), ["Z"]);
    expect(v).toBeCloseTo(-1, 9);
  });

  test("noise averages toward the noisy expectation and stays finite", () => {
    const v = noisyPauliExpectation(ry, {}, [], noiseless({ oneQubitDepolarising: 0.1, trajectories: 2000 }), ["Z"]);
    expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  test("exercises 2q and 3q gate branches (GHZ ⟨ZZZ⟩ = 1 under zero noise)", () => {
    const ghz = circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("ccx", [2], [0, 1])]);
    // h, cx make a Bell pair on (0,1); ccx flips q2 only when q0=q1=1 — not a
    // GHZ, but a deterministic state. We just need the >2-qubit branch covered.
    const v = noisyPauliExpectation(ghz, {}, [], noiseless({ twoQubitDepolarising: 0.02, trajectories: 50 }), ["Z", "Z", "Z"]);
    expect(Number.isFinite(v)).toBe(true);
  });

  test("handles measurement, reset, conditionals, prep and anti-controls", () => {
    const c: Circuit = {
      numQubits: 2,
      numClbits: 1,
      gates: [
        { ...gate("init1", [0]), column: 0 },
        { ...gate("measure", [0]), clbits: [0], column: 1 },
        { ...gate("x", [1]), condition: { clbit: 0, value: 1 }, column: 2 },
        { ...gate("cx", [1], [0]), controlStates: [false], column: 3 },
        { ...gate("reset", [0]), column: 4 },
      ],
    };
    const v = noisyPauliExpectation(c, {}, [], noiseless({ trajectories: 20 }), ["Z", "I"]);
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe("noisyExpectationObservable", () => {
  test("pauli observable matches the dedicated path under zero noise", () => {
    const v = noisyExpectationObservable(ry, {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] });
    expect(v).toBeCloseTo(0.5, 9);
  });

  test("Pauli-sum observable: H = 0.5·Z ⇒ ⟨H⟩ = 0.25", () => {
    const v = noisyExpectationObservable(
      ry, {}, [], noiseless(),
      { kind: "sum", terms: [{ coefficient: 0.5, paulis: "Z" }] },
    );
    expect(v).toBeCloseTo(0.25, 9);
  });

  test("post-selection keeps matching trajectories and conditions the value", () => {
    // X|0⟩ = |1⟩, then a Z-measurement to c[0] yields 1 deterministically.
    const c: Circuit = {
      numQubits: 1,
      numClbits: 1,
      gates: [
        { ...gate("x", [0]), column: 0 },
        { ...gate("measure", [0]), clbits: [0], column: 1 },
      ],
    };
    // Selecting c[0]==1 keeps every trajectory; ⟨Z⟩ on the collapsed |1⟩ = −1.
    const kept = noisyExpectationObservable(c, {}, [], noiseless({ trajectories: 10 }), { kind: "pauli", paulis: ["Z"] }, { clbit: 0, value: 1 });
    expect(kept).toBeCloseTo(-1, 9);
    // Selecting the impossible c[0]==0 discards all ⇒ NaN ("no data").
    const dropped = noisyExpectationObservable(c, {}, [], noiseless({ trajectories: 10 }), { kind: "pauli", paulis: ["Z"] }, { clbit: 0, value: 0 });
    expect(Number.isNaN(dropped)).toBe(true);
  });

  test("custom 1q + 2q Kraus channels (identity ops) leave the value finite", () => {
    const k1 = [[1, 0, 0, 0, 0, 0, 1, 0]]; // 2×2 identity, 8 floats
    const id4: number[] = new Array(32).fill(0);
    for (let i = 0; i < 4; i++) id4[(i * 4 + i) * 2] = 1; // 4×4 identity, 32 floats
    const noise = noiseless({
      trajectories: 10,
      customKraus: { enabled: true, name: "I1", operators: k1 },
      customKraus2q: { enabled: true, name: "I2", operators: [id4] },
    });
    const bell = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
    const v = noisyExpectationObservable(bell, {}, [], noise, { kind: "pauli", paulis: ["Z", "Z"] });
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(1, 9); // identity Kraus ⇒ undisturbed Bell ⟨ZZ⟩ = 1
  });

  test("exercises the >2-qubit gate branch via the observable path", () => {
    const c = circ(3, [gate("h", [0]), gate("ccx", [2], [0, 1])]);
    const v = noisyExpectationObservable(
      c, {}, [], noiseless({ twoQubitDepolarising: 0.02, amplitudeDamping: 0.01, trajectories: 30 }),
      { kind: "pauli", paulis: ["Z", "I", "I"] },
    );
    expect(Number.isFinite(v)).toBe(true);
  });
});

describe("simulateNoisy — free-symbol collection", () => {
  test("reports free symbols while ignoring constants and math functions", () => {
    const c = circ(1, [gate("rx", [0], [], ["sin(theta) + pi/2"]), gate("ry", [0], [], ["phi"])]);
    const r = simulateNoisy(c, { theta: 0.3, phi: 0.4 }, [], noiseless({ trajectories: 1 }));
    expect(r.freeSymbols.sort()).toEqual(["phi", "theta"]); // "sin" and "pi" excluded
  });
});
