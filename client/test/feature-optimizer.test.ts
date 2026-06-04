import { describe, test, expect } from "vitest";
import { optimiseCircuit } from "../src/sim/optimisePasses";
import { equivalenceCheck } from "../src/sim/equivalence";
import { transpile, type TranspileTarget } from "../src/sim/transpile";
import { mulberry32 } from "../src/sim/measure";
import { circ, gate } from "./helpers";
import type { Circuit, PlacedGate } from "../src/editor/types";

const eqv = (a: Circuit, b: Circuit) => equivalenceCheck(a, b, [], [], {});
/** Optimise `c` and assert (a) the unitary is preserved and (b) the input
 *  circuit is not mutated. Returns the optimised circuit for further checks. */
function optEquiv(c: Circuit, deep = false): Circuit {
  const colsBefore = c.gates.map((g) => g.column);
  const idsBefore = c.gates.map((g) => g.id);
  const o = optimiseCircuit(c, { deep });
  // Input must be untouched (no in-place column/id mutation).
  expect(c.gates.map((g) => g.column)).toEqual(colsBefore);
  expect(c.gates.map((g) => g.id)).toEqual(idsBefore);
  const r = eqv(c, o.circuit);
  expect(r.equivalent, `not equivalent (maxDev ${r.maxDeviation})`).toBe(true);
  return o.circuit;
}

// ── Per-rule: each rewrite fires AND preserves the unitary ──────────────
describe("optimiser rewrite rules (fire + stay equivalent)", () => {
  test("self-inverse: X·X → I", () => {
    const o = optEquiv(circ(1, [gate("x", [0], [], [], 0), gate("x", [0], [], [], 1)]));
    expect(o.gates.length).toBe(0);
  });
  test("self-inverse (2q): CX·CX → I", () => {
    const o = optEquiv(circ(2, [gate("cx", [1], [0], [], 0), gate("cx", [1], [0], [], 1)]));
    expect(o.gates.length).toBe(0);
  });
  test("dagger pair: S·S† → I", () => {
    const o = optEquiv(circ(1, [gate("s", [0], [], [], 0), gate("sdg", [0], [], [], 1)]));
    expect(o.gates.length).toBe(0);
  });
  test("rotation merge: RZ·RZ → RZ", () => {
    const o = optEquiv(circ(1, [gate("rz", [0], [], ["0.3"], 0), gate("rz", [0], [], ["0.4"], 1)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("rz");
  });
  test("Pauli collapse: X·Y → Z", () => {
    const o = optEquiv(circ(1, [gate("x", [0], [], [], 0), gate("y", [0], [], [], 1)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("z");
  });
  test("power-merge: T·T → S", () => {
    const o = optEquiv(circ(1, [gate("t", [0], [], [], 0), gate("t", [0], [], [], 1)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("s");
  });
  test("power-merge: √X·√X → X", () => {
    const o = optEquiv(circ(1, [gate("sx", [0], [], [], 0), gate("sx", [0], [], [], 1)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("x");
  });
  test("H·CX·H → CZ", () => {
    const o = optEquiv(circ(2, [gate("h", [1], [], [], 0), gate("cx", [1], [0], [], 1), gate("h", [1], [], [], 2)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("cz");
  });
  test("H·CZ·H → CX", () => {
    const o = optEquiv(circ(2, [gate("h", [1], [], [], 0), gate("cz", [1], [0], [], 1), gate("h", [1], [], [], 2)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("cx");
  });
  test("Hadamard-Pauli sandwich: H·X·H → Z", () => {
    const o = optEquiv(circ(1, [gate("h", [0], [], [], 0), gate("x", [0], [], [], 1), gate("h", [0], [], [], 2)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("z");
  });
  test("CX-conjugation: X(t)·CX·X(t) → CX", () => {
    const o = optEquiv(circ(2, [gate("x", [1], [], [], 0), gate("cx", [1], [0], [], 1), gate("x", [1], [], [], 2)]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("cx");
  });
  test("3-CX → SWAP synthesis", () => {
    const o = optEquiv(circ(2, [
      gate("cx", [1], [0], [], 0), gate("cx", [0], [1], [], 1), gate("cx", [1], [0], [], 2),
    ]));
    expect(o.gates.length).toBe(1);
    expect(o.gates[0].gateId).toBe("swap");
  });
  test("iSWAP·iSWAP → Z·Z", () => {
    const o = optEquiv(circ(2, [gate("iswap", [0, 1], [], [], 0), gate("iswap", [0, 1], [], [], 1)]));
    expect(o.gates.length).toBe(2);
    expect(o.gates.every((g) => g.gateId === "z")).toBe(true);
  });
  test("DCX·DCX·DCX → I", () => {
    const o = optEquiv(circ(2, [
      gate("dcx", [0, 1], [], [], 0), gate("dcx", [0, 1], [], [], 1), gate("dcx", [0, 1], [], [], 2),
    ]));
    expect(o.gates.length).toBe(0);
  });
  test("does NOT merge sx·sx across an intervening rz (regression)", () => {
    // The bug: sx·rz·rz·sx → x·rz. Must stay equivalent (and keep both sx).
    const o = optEquiv(circ(1, [
      gate("sx", [0], [], [], 0), gate("rz", [0], [], ["0.7"], 1),
      gate("rz", [0], [], ["pi"], 2), gate("sx", [0], [], [], 3),
    ]));
    expect(o.gates.filter((g) => g.gateId === "x").length).toBe(0);
  });
});

// ── Deep mode: commute-through-diagonals ────────────────────────────────
describe("deep mode (commute-through-diagonals)", () => {
  test("merges RZ rotations separated by a diagonal CZ, preserving the unitary", () => {
    // RZ(a) on q0, CZ(0,1) (diagonal on q0), RZ(b) on q0 — the two RZ commute
    // through the CZ and merge under deep mode.
    const c = circ(2, [gate("rz", [0], [], ["0.3"], 0), gate("cz", [1], [0], [], 1), gate("rz", [0], [], ["0.4"], 2)]);
    const shallow = optEquiv(c, false);
    const deep = optEquiv(c, true);
    // Deep mode should fold the two RZ together → one fewer RZ than shallow.
    const rzCount = (x: Circuit) => x.gates.filter((g) => g.gateId === "rz").length;
    expect(rzCount(deep)).toBeLessThan(rzCount(shallow));
  });
});

// ── Property/fuzz: optimise preserves the unitary on varied circuits ────
const ONE = ["h", "x", "y", "z", "s", "sdg", "t", "tdg", "sx", "sxdg"];
const ROT = ["rz", "rx", "ry", "p"];
const TWO_CTRL = ["cx", "cz"];
const TWO_SYM = ["swap", "iswap", "dcx"];

function randomCircuit(rand: () => number, n: number, count: number): Circuit {
  const gates: PlacedGate[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    if (n >= 2 && r < 0.4) {
      let a = Math.floor(rand() * n), b = Math.floor(rand() * n);
      while (b === a) b = Math.floor(rand() * n);
      if (rand() < 0.6) gates.push(gate(TWO_CTRL[Math.floor(rand() * TWO_CTRL.length)], [b], [a], [], i));
      else gates.push(gate(TWO_SYM[Math.floor(rand() * TWO_SYM.length)], [a, b], [], [], i));
    } else if (r < 0.7) {
      gates.push(gate(ONE[Math.floor(rand() * ONE.length)], [Math.floor(rand() * n)], [], [], i));
    } else {
      const angle = ((rand() * 2 - 1) * Math.PI).toFixed(4);
      gates.push(gate(ROT[Math.floor(rand() * ROT.length)], [Math.floor(rand() * n)], [], [angle], i));
    }
  }
  return circ(n, gates);
}

describe("property: optimise preserves the unitary (fuzz)", () => {
  test("40 random circuits, shallow and deep, stay equivalent and don't mutate input", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const c = randomCircuit(mulberry32(seed), 3, 9);
      for (const deep of [false, true]) {
        optEquiv(c, deep); // asserts equivalence + no input mutation internally
      }
    }
  });

  test("optimising transpiled circuits (IBM / Rigetti / Clifford+T) stays equivalent", () => {
    const targets: TranspileTarget[] = ["ibm-heavy-hex", "rigetti", "clifford-t"];
    for (let seed = 1; seed <= 20; seed++) {
      const src = randomCircuit(mulberry32(seed * 7 + 1), 3, 7);
      for (const tgt of targets) {
        const tr = transpile(src, tgt);
        if (tr.skipped.length > 0) continue; // e.g. Clifford+T can't do arbitrary angles
        optEquiv(tr.circuit, true);
      }
    }
  });
});
