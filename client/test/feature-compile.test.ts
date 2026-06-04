import { describe, test, expect } from "vitest";
import { compileForDevice } from "../src/sim/compile";
import { equivalenceCheck } from "../src/sim/equivalence";
import { circ, gate } from "./helpers";

const rot = circ(2, [
  gate("h", [0]), gate("ry", [1], [], ["0.7"]), gate("cx", [1], [0]), gate("rz", [0], [], ["pi/3"]),
]);

describe("compileForDevice", () => {
  test("without a coupling map: transpile + optimise stages, unitary preserved", () => {
    const r = compileForDevice(rot, "ibm-heavy-hex", undefined);
    expect(r.stages.map((s) => s.name)).toEqual(["input", "transpile", "optimise"]);
    expect(equivalenceCheck(rot, r.circuit, [], [], {}).equivalent).toBe(true);
  });

  test("with a coupling map: adds route + optimise stages and labels the circuit", () => {
    const r = compileForDevice(rot, "ibm-heavy-hex", [[1], [0]]);
    expect(r.stages.map((s) => s.name)).toEqual(["input", "transpile", "optimise", "route", "optimise"]);
    expect(r.circuit.name).toMatch(/IBM heavy-hex/);
  });

  test("each stage reports a gate count and depth", () => {
    const r = compileForDevice(rot, "rigetti", undefined);
    for (const s of r.stages) {
      expect(s.gates).toBeGreaterThanOrEqual(0);
      expect(s.depth).toBeGreaterThanOrEqual(0);
    }
    expect(r.circuit.name).toMatch(/Rigetti/);
  });
});
