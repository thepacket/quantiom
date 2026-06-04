import { describe, test, expect } from "vitest";
import { transpile, type TranspileTarget } from "../src/sim/transpile";
import { equivalenceCheck } from "../src/sim/equivalence";
import { circ, gate } from "./helpers";

// A circuit the textbook Clifford+T target can handle exactly (no arbitrary
// angles): H, CX, T, S, and a Toffoli.
const cliffordT = circ(3, [
  gate("h", [0]), gate("cx", [1], [0]), gate("t", [1]), gate("ccx", [2], [0, 1]),
]);

// A continuous-rotation circuit for the IBM / Rigetti targets.
const rotational = circ(2, [
  gate("h", [0]), gate("ry", [1], [], ["0.7"]), gate("cx", [1], [0]), gate("rz", [0], [], ["pi/3"]),
]);

function assertEquivalent(target: TranspileTarget, src = rotational) {
  const r = transpile(src, target);
  expect(r.skipped, JSON.stringify(r.skipped)).toHaveLength(0);
  const eq = equivalenceCheck(src, r.circuit, [], [], {});
  expect(eq.equivalent, `${target}: maxDev=${eq.maxDeviation}`).toBe(true);
}

describe("transpile preserves the unitary", () => {
  test("Clifford+T Toffoli decomposition is equivalent", () => {
    const r = transpile(cliffordT, "clifford-t");
    const eq = equivalenceCheck(cliffordT, r.circuit, [], [], {});
    expect(eq.equivalent, `maxDev=${eq.maxDeviation}`).toBe(true);
  });

  test("IBM heavy-hex target is equivalent", () => assertEquivalent("ibm-heavy-hex"));
  test("Rigetti target is equivalent", () => assertEquivalent("rigetti"));
});

describe("transpile metrics", () => {
  test("Toffoli decomposition raises CX and T counts under Clifford+T", () => {
    const r = transpile(cliffordT, "clifford-t");
    expect(r.after.cx).toBeGreaterThan(r.before.cx);
    expect(r.after.tCount).toBeGreaterThanOrEqual(7); // a Toffoli needs ≥7 T
  });

  test("before/after gate counts are reported", () => {
    const r = transpile(rotational, "ibm-heavy-hex");
    expect(r.before.gates).toBe(4);
    expect(r.after.gates).toBeGreaterThan(0);
  });
});
