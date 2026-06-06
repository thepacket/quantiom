import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { collectiveSpinGenerator, quantumFisherPure } from "../src/sim/qfi";
import { circ, gate } from "./helpers";

const qfi = (n: number, gates: ReturnType<typeof gate>[], axis: "X" | "Y" | "Z") => {
  const res = simulate(circ(n, gates), {}, []);
  return quantumFisherPure(res.state, n, collectiveSpinGenerator(n, axis));
};

describe("quantumFisherPure (collective J_α)", () => {
  test("|0…0⟩ has zero QFI along Z (an eigenstate of J_z)", () => {
    const r = qfi(4, [], "Z");
    expect(r.qfi).toBeCloseTo(0, 9);
    expect(r.variance).toBeCloseTo(0, 9);
    expect(r.witnessesEntanglement).toBe(false);
  });

  test("product |+…+⟩ saturates the standard quantum limit F_Q = N along Z", () => {
    const n = 4;
    const r = qfi(n, [gate("h", [0]), gate("h", [1]), gate("h", [2]), gate("h", [3])], "Z");
    expect(r.qfi).toBeCloseTo(n, 6); // each qubit Var(σz/2)=1/4 ⇒ 4·N·1/4 = N
    expect(r.qfiDensity).toBeCloseTo(1, 6);
    expect(r.witnessesEntanglement).toBe(false); // exactly at the SQL, not above
  });

  test("GHZ_N saturates the Heisenberg limit F_Q = N² along Z", () => {
    for (const n of [2, 3, 4]) {
      const gs = [gate("h", [0], [], [], 0)];
      for (let q = 1; q < n; q++) gs.push(gate("cx", [q], [q - 1], [], q));
      const r = qfi(n, gs, "Z");
      expect(r.qfi).toBeCloseTo(n * n, 6);
      expect(r.qfiDensity).toBeCloseTo(n, 6);
      expect(r.witnessesEntanglement).toBe(n > 1);
      expect(r.heisenberg).toBe(n * n);
      expect(r.sql).toBe(n);
    }
  });

  test("⟨J_z⟩ vanishes for GHZ (equal weight on |0…0⟩ and |1…1⟩)", () => {
    const r = qfi(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)], "Z");
    expect(r.expG).toBeCloseTo(0, 9);
    // Var = ⟨J²⟩ = (N/2)² for the GHZ cat ⇒ F_Q = N².
    expect(r.variance).toBeCloseTo((3 / 2) * (3 / 2), 6);
  });

  test("single qubit |+⟩: QFI=1 along Z, 0 along X (eigenstate of J_x)", () => {
    const z = qfi(1, [gate("h", [0])], "Z");
    const x = qfi(1, [gate("h", [0])], "X");
    expect(z.qfi).toBeCloseTo(1, 9);
    expect(x.qfi).toBeCloseTo(0, 9);
  });

  test("generator builder places ½ on each single-qubit Pauli", () => {
    const g = collectiveSpinGenerator(3, "Y");
    expect(g).toHaveLength(3);
    expect(g.map((t) => t.paulis)).toEqual(["YII", "IYI", "IIY"]);
    for (const t of g) expect(t.coefficient).toBe(0.5);
  });

  test("variance is clamped non-negative", () => {
    const r = qfi(2, [], "Z");
    expect(r.variance).toBeGreaterThanOrEqual(0);
  });
});
