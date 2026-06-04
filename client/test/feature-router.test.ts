import { describe, test, expect } from "vitest";
import { routeCircuit, countConnectivityViolations } from "../src/sim/router";
import { circ, gate } from "./helpers";

// Linear coupling on 4 qubits: 0–1–2–3.
const line: number[][] = [[1], [0, 2], [1, 3], [2]];

describe("greedy SWAP router", () => {
  test("a non-adjacent CX gets routed to zero violations", () => {
    const c = circ(4, [gate("cx", [3], [0])]); // qubits 0 and 3 are far apart
    expect(countConnectivityViolations(c, line)).toBeGreaterThan(0);
    const r = routeCircuit(c, line);
    expect(countConnectivityViolations(r.circuit, line)).toBe(0);
    expect(r.swapsInserted).toBeGreaterThan(0);
  });

  test("an already-adjacent circuit needs no swaps", () => {
    const c = circ(4, [gate("cx", [1], [0]), gate("cx", [2], [1])]);
    const r = routeCircuit(c, line);
    expect(r.swapsInserted).toBe(0);
    expect(countConnectivityViolations(r.circuit, line)).toBe(0);
  });

  test("a single non-adjacent gate reports one routing intervention", () => {
    // violationsBefore counts routing interventions against the *evolving*
    // mapping, so for a single gate it coincides with the static count.
    const c = circ(4, [gate("cx", [3], [0])]);
    const r = routeCircuit(c, line);
    expect(r.violationsBefore).toBe(1);
    expect(r.violationsBefore).toBe(countConnectivityViolations(c, line));
    expect(r.finalMapping).toHaveLength(4);
  });

  test("single-qubit gates never violate connectivity", () => {
    const c = circ(4, [gate("h", [0]), gate("x", [3]), gate("t", [2])]);
    expect(countConnectivityViolations(c, line)).toBe(0);
    expect(routeCircuit(c, line).swapsInserted).toBe(0);
  });
});
