import { describe, test, expect } from "vitest";
import { measureX, measureY, reset } from "../src/sim/measure";

// 1-qubit state as a Float64Array [re0, im0, re1, im1].
const s = (re0: number, im0: number, re1: number, im1: number) =>
  Float64Array.from([re0, im0, re1, im1]);
const r1 = Math.SQRT1_2;
const always = (v: number) => () => v; // constant RNG

describe("measureX", () => {
  test("|+⟩ is the +1 eigenstate ⇒ outcome 0 regardless of RNG", () => {
    expect(measureX(s(r1, 0, r1, 0), 1, 0, always(0.9))).toBe(0);
    const st = s(r1, 0, r1, 0);
    measureX(st, 1, 0, always(0.1));
    // Post-measurement state is back in |+⟩ (eigenstate preserved).
    expect(st[0]).toBeCloseTo(r1, 9);
    expect(st[2]).toBeCloseTo(r1, 9);
  });

  test("|−⟩ is the −1 eigenstate ⇒ outcome 1 regardless of RNG", () => {
    expect(measureX(s(r1, 0, -r1, 0), 1, 0, always(0.1))).toBe(1);
  });
});

describe("measureY", () => {
  test("|+i⟩ ⇒ outcome 0", () => {
    expect(measureY(s(r1, 0, 0, r1), 1, 0, always(0.9))).toBe(0);
  });
  test("|−i⟩ ⇒ outcome 1", () => {
    expect(measureY(s(r1, 0, 0, -r1), 1, 0, always(0.1))).toBe(1);
  });
});

describe("reset", () => {
  test("collapses |1⟩ to |0⟩", () => {
    const st = s(0, 0, 1, 0);
    reset(st, 1, 0, always(0.5));
    expect(st[0]).toBeCloseTo(1, 9);
    expect(st[2]).toBeCloseTo(0, 9);
  });

  test("leaves |0⟩ as |0⟩", () => {
    const st = s(1, 0, 0, 0);
    reset(st, 1, 0, always(0.5));
    expect(st[0]).toBeCloseTo(1, 9);
  });
});
