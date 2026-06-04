import { describe, test, expect } from "vitest";
import { emitQasm3 } from "../src/qasm/emit";
import { parseQasm3 } from "../src/qasm/parse";
import { equivalenceCheck } from "../src/sim/equivalence";
import { circ, gate } from "./helpers";
import type { Circuit } from "../src/editor/types";

function parse(src: string): Circuit {
  const r = parseQasm3(src);
  if (!r.ok) throw new Error("parse failed: " + JSON.stringify(r));
  return r.circuit;
}

/** emit → parse → assert unitary-equivalent to the original. */
function roundTrips(c: Circuit) {
  const back = parse(emitQasm3(c));
  const r = equivalenceCheck(c, back, [], [], {});
  expect(r.equivalent, `maxDev=${r.maxDeviation}`).toBe(true);
}

describe("OpenQASM 3 round-trip (emit → parse → equivalent)", () => {
  test("Bell state", () => {
    roundTrips(circ(2, [gate("h", [0]), gate("cx", [1], [0])]));
  });

  test("rotations with symbolic-looking numeric params", () => {
    roundTrips(circ(2, [
      gate("rx", [0], [], ["pi/2"]), gate("ry", [1], [], ["0.7"]), gate("rzz", [1], [0], ["1.3"]),
    ]));
  });

  test("3-qubit GHZ + Toffoli", () => {
    roundTrips(circ(3, [
      gate("h", [0]), gate("cx", [1], [0]), gate("ccx", [2], [0, 1]),
    ]));
  });

  test("anti-control round-trips", () => {
    const g = { ...gate("cx", [1], [0]), controlStates: [false] };
    roundTrips(circ(2, [g]));
  });

  test("emit is idempotent (emit∘parse∘emit == emit)", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0]), gate("rz", [1], [], ["pi/4"])]);
    const once = emitQasm3(c);
    const twice = emitQasm3(parse(once));
    expect(twice).toBe(once);
  });

  test("emitted QASM declares the right register widths", () => {
    const src = emitQasm3(circ(3, [gate("h", [0])], 2));
    expect(src).toMatch(/qubit\[3\]/);
    expect(src).toMatch(/bit\[2\]/);
  });

  test("parses OpenQASM 2 style (qreg/creg)", () => {
    const c = parse(`OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\n`);
    expect(c.numQubits).toBe(2);
    const r = equivalenceCheck(c, circ(2, [gate("h", [0]), gate("cx", [1], [0])]), [], [], {});
    expect(r.equivalent).toBe(true);
  });
});
