import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";

// Run a 1-qubit `initialize(state)` and return the SimResult.
const init = (stateStr: string, params = {}) =>
  simulate(circ(1, [gate("initialize", [0], [], [stateStr])]), params, []);

describe("initialize — basis-state labels", () => {
  test("|0⟩ and |1⟩", () => {
    expect(init("|0⟩").probabilities[0]).toBeCloseTo(1, 9);
    expect(init("|1⟩").probabilities[1]).toBeCloseTo(1, 9);
  });

  test("|+⟩ and |−⟩ are equal superpositions with the right relative phase", () => {
    const plus = init("|+⟩").amplitudes;
    expect(plus[0].re).toBeCloseTo(Math.SQRT1_2, 9);
    expect(plus[1].re).toBeCloseTo(Math.SQRT1_2, 9);
    const minus = init("|−⟩").amplitudes; // unicode minus
    expect(minus[1].re).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  test("|+i⟩ and |-i⟩ put the phase on the imaginary axis", () => {
    const pi = init("|+i⟩").amplitudes;
    expect(pi[1].im).toBeCloseTo(Math.SQRT1_2, 9);
    expect(pi[1].re).toBeCloseTo(0, 9);
    expect(init("|-i⟩").amplitudes[1].im).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  test("bare labels (no ket brackets) also parse", () => {
    expect(init("1").probabilities[1]).toBeCloseTo(1, 9);
    expect(init("+").probabilities[0]).toBeCloseTo(0.5, 9);
  });
});

describe("initialize — amplitude tuples", () => {
  test("(re_a, im_a, re_b, im_b) sets the qubit directly", () => {
    expect(init("(0, 0, 1, 0)").probabilities[1]).toBeCloseTo(1, 9);
    const plus = init("(1/sqrt(2), 0, 1/sqrt(2), 0)").probabilities;
    expect(plus[0]).toBeCloseTo(0.5, 9);
  });

  test("components are parameter expressions bound from paramValues", () => {
    // (cos t, 0, sin t, 0) with t = π/2 ⇒ |1⟩.
    const r = init("(cos(t), 0, sin(t), 0)", { t: Math.PI / 2 });
    expect(r.probabilities[1]).toBeCloseTo(1, 9);
  });

  test("an un-normalised tuple is normalised", () => {
    expect(init("(2, 0, 0, 0)").probabilities[0]).toBeCloseTo(1, 9);
  });
});

describe("initialize — failure modes are recorded as skipped", () => {
  test("a zero-norm tuple can't be applied", () => {
    const r = init("(0, 0, 0, 0)");
    expect(r.skipped.some((s) => s.gateId === "initialize")).toBe(true);
  });

  test("garbage input is skipped, not crashed", () => {
    const r = init("not a state");
    expect(r.skipped.some((s) => s.gateId === "initialize")).toBe(true);
  });

  test("initialize on an entangled qubit can't apply as a unitary prep", () => {
    // Bell-entangle q0 with q1, then try to re-initialize q0.
    const c = circ(2, [
      gate("h", [0]),
      gate("cx", [1], [0]),
      gate("initialize", [0], [], ["|1⟩"]),
    ]);
    const r = simulate(c, {}, []);
    expect(r.skipped.some((s) => s.gateId === "initialize")).toBe(true);
  });
});
