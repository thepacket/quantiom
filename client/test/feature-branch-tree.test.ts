import { describe, test, expect } from "vitest";
import { branchTree, type BranchNode } from "../src/sim/branchTree";
import { circ, gate } from "./helpers";

/** Collect leaves with their cumulative probability and classical bits. */
function leaves(node: BranchNode, acc: BranchNode[] = []): BranchNode[] {
  if (node.children.length === 0) acc.push(node);
  else for (const c of node.children) leaves(c, acc);
  return acc;
}

describe("branchTree", () => {
  test("a single measurement of |+⟩ forks into two equal branches", () => {
    const c = circ(1, [gate("h", [0], [], [], 0), gate("measure", [0], [], [], 1)], 1);
    // measure writes to clbit 0
    c.gates[1].clbits = [0];
    const r = branchTree(c, {}, [])!;
    expect(r.events).toBe(1);
    expect(r.numLeaves).toBe(2);
    const ls = leaves(r.root);
    const probs = ls.map((l) => l.prob).sort();
    expect(probs[0]).toBeCloseTo(0.5, 9);
    expect(probs[1]).toBeCloseTo(0.5, 9);
    expect(ls.map((l) => l.bits).sort()).toEqual(["0", "1"]);
  });

  test("measuring |0⟩ gives a single branch (the 1-outcome is pruned)", () => {
    const c = circ(1, [gate("measure", [0], [], [], 0)], 1);
    c.gates[0].clbits = [0];
    const r = branchTree(c, {}, [])!;
    expect(r.numLeaves).toBe(1);
    const ls = leaves(r.root);
    expect(ls[0].prob).toBeCloseTo(1, 9);
    expect(ls[0].bits).toBe("0");
  });

  test("Bell pair: two correlated measurements collapse to 2 matching leaves", () => {
    const c = circ(2, [
      gate("h", [0], [], [], 0),
      gate("cx", [1], [0], [], 1),
      gate("measure", [0], [], [], 2),
      gate("measure", [1], [], [], 3),
    ], 2);
    c.gates[2].clbits = [0];
    c.gates[3].clbits = [1];
    const r = branchTree(c, {}, [])!;
    // After measuring qubit 0, qubit 1 is determined → only 00 and 11 survive.
    const ls = leaves(r.root);
    const bitsAndP = ls.map((l) => [l.bits, Number(l.prob.toFixed(6))]).sort();
    expect(bitsAndP).toEqual([["00", 0.5], ["11", 0.5]]);
    expect(r.numLeaves).toBe(2);
  });

  test("conditional X (teleport-style) acts only on the matching branch", () => {
    // measure |+⟩ into c0; if c0==1 apply X to qubit 1 (starts |0⟩).
    const c = circ(2, [
      gate("h", [0], [], [], 0),
      gate("measure", [0], [], [], 1),
      gate("x", [1], [], [], 2),
    ], 2);
    c.gates[1].clbits = [0];
    c.gates[2].condition = { clbit: 0, value: 1 };
    const r = branchTree(c, {}, [])!;
    const ls = leaves(r.root);
    expect(ls).toHaveLength(2);
    // Both branches equally likely; classical bit only records c0.
    for (const l of ls) expect(l.prob).toBeCloseTo(0.5, 9);
  });

  test("reset forks but records no classical bit and ends in |0⟩", () => {
    const c = circ(1, [gate("h", [0], [], [], 0), gate("reset", [0], [], [], 1)], 1);
    const r = branchTree(c, {}, [])!;
    expect(r.events).toBe(1);
    // |+⟩ reset → both pre-measure outcomes, each 1/2, both end |0⟩.
    const ls = leaves(r.root);
    expect(ls).toHaveLength(2);
    for (const l of ls) expect(l.prob).toBeCloseTo(0.5, 9);
    // reset labels carry no clbit.
    expect(r.root.children[0].label).toBe("reset q0");
  });

  test("edge probabilities are conditional and multiply to the leaf probability", () => {
    const c = circ(2, [
      gate("h", [0], [], [], 0),
      gate("measure", [0], [], [], 1),
      gate("h", [1], [], [], 2),
      gate("measure", [1], [], [], 3),
    ], 2);
    c.gates[1].clbits = [0];
    c.gates[3].clbits = [1];
    const r = branchTree(c, {}, [])!;
    expect(r.numLeaves).toBe(4);
    for (const l of leaves(r.root)) expect(l.prob).toBeCloseTo(0.25, 9);
  });

  test("returns null past the qubit cap", () => {
    const c = circ(13, [gate("measure", [0], [], [], 0)], 1);
    c.gates[0].clbits = [0];
    expect(branchTree(c, {}, [])).toBeNull();
  });

  test("X-basis measurement of |0⟩ forks 50/50", () => {
    const c = circ(1, [gate("measure_x", [0], [], [], 0)], 1);
    c.gates[0].clbits = [0];
    const r = branchTree(c, {}, [])!;
    const ls = leaves(r.root);
    expect(ls).toHaveLength(2);
    for (const l of ls) expect(l.prob).toBeCloseTo(0.5, 9);
  });
});
