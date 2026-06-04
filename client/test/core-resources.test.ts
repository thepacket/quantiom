import { describe, test, expect } from "vitest";
import { estimateResources } from "../src/sim/resources";
import { circ, gate } from "./helpers";

describe("estimateResources", () => {
  test("counts gate arities", () => {
    const r = estimateResources(circ(3, [
      gate("h", [0]), gate("x", [1]), gate("cx", [2], [1]), gate("ccx", [2], [0, 1]),
    ]));
    expect(r.totalGates).toBe(4);
    expect(r.oneQubit).toBe(2);
    expect(r.twoQubit).toBe(1);
    expect(r.multiQubit).toBe(1);
  });

  test("T-count and T-depth", () => {
    // Two T gates in the same column = T-count 2, T-depth 1.
    const r = estimateResources(circ(2, [
      gate("t", [0], [], [], 0), gate("t", [1], [], [], 0), gate("tdg", [0], [], [], 1),
    ]));
    expect(r.tCount).toBe(3);
    expect(r.tDepth).toBe(2);
  });

  test("CX count and clifford count", () => {
    const r = estimateResources(circ(2, [gate("cx", [1], [0]), gate("h", [0]), gate("t", [0])]));
    expect(r.cxCount).toBe(1);
    expect(r.cliffordCount).toBe(2); // cx + h, not t
  });

  test("measurements and parameterized gates", () => {
    const r = estimateResources(circ(1, [
      gate("rx", [0], [], ["theta"]), { ...gate("measure", [0]), clbits: [0] },
    ]));
    expect(r.measurements).toBe(1);
    expect(r.parameterized).toBe(1);
    expect(r.freeSymbols).toBe(1);
  });

  test("distinct qubits ignores untouched wires", () => {
    const r = estimateResources(circ(5, [gate("h", [0]), gate("cx", [3], [0])]));
    expect(r.distinctQubits).toBe(2); // qubits {0, 3}
  });

  test("parallel depth equals max column + 1", () => {
    const r = estimateResources(circ(1, [
      gate("h", [0], [], [], 0), gate("h", [0], [], [], 1), gate("h", [0], [], [], 2),
    ]));
    expect(r.parallelDepth).toBe(3);
  });

  test("empty circuit is all-zero", () => {
    const r = estimateResources(circ(2, []));
    expect(r.totalGates).toBe(0);
    expect(r.tCount).toBe(0);
    expect(r.parallelDepth).toBe(0);
  });
});
