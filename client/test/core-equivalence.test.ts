import { describe, test, expect } from "vitest";
import { equivalenceCheck } from "../src/sim/equivalence";
import { circ, gate } from "./helpers";

const eq = (a: Parameters<typeof equivalenceCheck>[0], b: Parameters<typeof equivalenceCheck>[1]) =>
  equivalenceCheck(a, b, [], [], {});

describe("equivalenceCheck", () => {
  test("a circuit equals itself", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
    const r = eq(c, circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
    expect(r.equivalent).toBe(true);
    expect(r.processFidelity).toBeCloseTo(1, 9);
  });

  test("H·H = I", () => {
    const r = eq(
      circ(1, [gate("h", [0], [], [], 0), gate("h", [0], [], [], 1)]),
      circ(1, [gate("i", [0])]),
    );
    expect(r.equivalent).toBe(true);
  });

  test("two CNOTs cancel", () => {
    const r = eq(
      circ(2, [gate("cx", [1], [0], [], 0), gate("cx", [1], [0], [], 1)]),
      circ(2, []),
    );
    expect(r.equivalent).toBe(true);
  });

  test("equivalence is insensitive to a global phase", () => {
    // Z = P(π) differs from S·S only by structure but is the same unitary;
    // a global phase on the whole circuit must not break equivalence.
    const r = eq(
      circ(1, [gate("z", [0])]),
      circ(1, [gate("s", [0], [], [], 0), gate("s", [0], [], [], 1)]),
    );
    expect(r.equivalent).toBe(true);
  });

  test("X and Z are NOT equivalent", () => {
    const r = eq(circ(1, [gate("x", [0])]), circ(1, [gate("z", [0])]));
    expect(r.equivalent).toBe(false);
    expect(r.maxDeviation).toBeGreaterThan(0.1);
  });

  test("different qubit counts are not equivalent", () => {
    const r = eq(circ(1, [gate("h", [0])]), circ(2, [gate("h", [0])]));
    expect(r.equivalent).toBe(false);
  });

  test("CNOT decomposition H·CZ·H == CNOT", () => {
    const r = eq(
      circ(2, [gate("h", [1], [], [], 0), gate("cz", [1], [0], [], 1), gate("h", [1], [], [], 2)]),
      circ(2, [gate("cx", [1], [0])]),
    );
    expect(r.equivalent).toBe(true);
  });
});
