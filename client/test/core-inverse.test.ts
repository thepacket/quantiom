import { describe, test, expect } from "vitest";
import { invertGate } from "../src/editor/inverse";
import { buildMatrix } from "../src/sim/matrices";
import { gate, matmul, dagger, matClose, identity } from "./helpers";

// Gates whose inverse is expressible via invertGate, with sample params.
const CASES: Array<{ id: string; params?: string[]; pn?: number[] }> = [
  { id: "h" }, { id: "x" }, { id: "y" }, { id: "z" },
  { id: "s" }, { id: "sdg" }, { id: "t" }, { id: "tdg" },
  { id: "sx" }, { id: "sxdg" }, { id: "sy" }, { id: "sydg" },
  { id: "p", params: ["0.7"], pn: [0.7] },
  { id: "rx", params: ["0.7"], pn: [0.7] },
  { id: "ry", params: ["1.1"], pn: [1.1] },
  { id: "rz", params: ["-0.4"], pn: [-0.4] },
  { id: "r", params: ["0.7", "1.3"], pn: [0.7, 1.3] },
  { id: "u", params: ["0.7", "1.1", "-0.4"], pn: [0.7, 1.1, -0.4] },
  { id: "gpi", params: ["0.9"], pn: [0.9] },
  { id: "gpi2", params: ["0.5"], pn: [0.5] },
  { id: "rxx", params: ["0.7"], pn: [0.7] },
  { id: "rzz", params: ["-0.4"], pn: [-0.4] },
  { id: "swap" }, { id: "sqrtswap" },
  { id: "fsim", params: ["0.7", "1.1"], pn: [0.7, 1.1] },
];

describe("invertGate produces a true matrix inverse (U_inv · U = I)", () => {
  for (const cse of CASES) {
    test(`${cse.id}† · ${cse.id} = I`, () => {
      const g = gate(cse.id, [0], [], cse.params ?? []);
      // two-qubit gates need a second target
      const def2 = ["swap", "sqrtswap", "fsim", "rxx", "rzz"];
      if (def2.includes(cse.id)) g.targets = [0, 1];
      const inv = invertGate(g);
      expect(inv, `invertGate returned null for ${cse.id}`).not.toBeNull();

      const U = buildMatrix(cse.id, cse.pn ?? [])!;
      // Evaluate the inverse's params numerically the same way buildMatrix
      // expects: invertGate negates/adjusts symbolic params; for the numeric
      // check we compare U_inv against U† (the analytic adjoint).
      const Udag = dagger(U);
      const invParams = (inv!.params ?? []).map((p) => evalNum(p));
      const Uinv = buildMatrix(inv!.gateId, invParams)!;
      expect(matClose(Uinv, Udag, 1e-9) || matClose(matmul(Uinv, U), identity(U.length), 1e-9)).toBe(true);
    });
  }
});

describe("gates with no single-gate adjoint are skipped, not wrongly inverted", () => {
  // iSWAP (order 4, iSWAP²=Z⊗Z) and DCX (order 3) are NOT self-inverse and
  // have no catalog dagger, so invertGate must refuse rather than return a
  // wrong matrix. (Regression test for the self-inverse mislabel bug.)
  for (const id of ["iswap", "dcx"]) {
    test(`${id} returns null`, () => {
      const g = gate(id, [0, 1]);
      expect(invertGate(g)).toBeNull();
    });
  }
  test("ecr remains genuinely self-inverse (ECR² = I)", () => {
    const inv = invertGate(gate("ecr", [0, 1]));
    expect(inv).not.toBeNull();
    expect(inv!.gateId).toBe("ecr");
  });
});

// Minimal numeric evaluator for the symbolic params invertGate emits
// (handles "-(x)", "x+π", plain numbers, π).
function evalNum(s: string): number {
  const t = s.replace(/π/g, String(Math.PI)).replace(/pi/g, String(Math.PI));
  // eslint-disable-next-line no-new-func
  try { return Function(`"use strict";return (${t});`)() as number; } catch { return NaN; }
}
