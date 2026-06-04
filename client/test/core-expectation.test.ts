import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { paulis, pauliSumExpectation, evaluateObservable, type Pauli } from "../src/sim/expectation";
import { circ, gate } from "./helpers";

const P = (s: string): Pauli[] => s.split("") as Pauli[];
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("single Pauli expectations", () => {
  test("⟨Z⟩ = +1 on |0⟩", () => {
    const r = simulate(circ(1, []), {});
    expect(close(paulis(r.state, 1, P("Z")), 1)).toBe(true);
  });
  test("⟨Z⟩ = -1 on |1⟩", () => {
    const r = simulate(circ(1, [gate("x", [0])]), {});
    expect(close(paulis(r.state, 1, P("Z")), -1)).toBe(true);
  });
  test("⟨Z⟩ = 0, ⟨X⟩ = +1 on |+⟩", () => {
    const r = simulate(circ(1, [gate("h", [0])]), {});
    expect(close(paulis(r.state, 1, P("Z")), 0)).toBe(true);
    expect(close(paulis(r.state, 1, P("X")), 1)).toBe(true);
  });
  test("⟨Y⟩ = +1 on |+i⟩ = S·H·|0⟩", () => {
    const r = simulate(circ(1, [gate("h", [0]), gate("s", [0])]), {});
    expect(close(paulis(r.state, 1, P("Y")), 1)).toBe(true);
  });
  test("Bell state: ⟨ZZ⟩ = +1, ⟨XX⟩ = +1, ⟨ZI⟩ = 0", () => {
    const r = simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {});
    expect(close(paulis(r.state, 2, P("ZZ")), 1)).toBe(true);
    expect(close(paulis(r.state, 2, P("XX")), 1)).toBe(true);
    expect(close(paulis(r.state, 2, P("ZI")), 0)).toBe(true);
  });
});

describe("Pauli-sum expectation", () => {
  test("H = Z₀ + Z₁ on |00⟩ gives 2", () => {
    const r = simulate(circ(2, []), {});
    const terms = [
      { coefficient: 1, paulis: "ZI" },
      { coefficient: 1, paulis: "IZ" },
    ];
    expect(close(pauliSumExpectation(r.state, 2, terms), 2)).toBe(true);
  });
  test("weighted sum 0.5·XX − 0.5·ZZ on Bell = 0.5·1 − 0.5·1 = 0", () => {
    const r = simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {});
    const terms = [
      { coefficient: 0.5, paulis: "XX" },
      { coefficient: -0.5, paulis: "ZZ" },
    ];
    expect(close(pauliSumExpectation(r.state, 2, terms), 0)).toBe(true);
  });
});

describe("evaluateObservable dispatch", () => {
  test("pauli kind matches paulis()", () => {
    const r = simulate(circ(1, [gate("h", [0])]), {});
    const v = evaluateObservable(r.state, 1, { kind: "pauli", paulis: P("X") });
    expect(close(v, 1)).toBe(true);
  });
  test("sum kind matches pauliSumExpectation()", () => {
    const r = simulate(circ(2, []), {});
    const v = evaluateObservable(r.state, 2, { kind: "sum", terms: [{ coefficient: 1, paulis: "ZI" }, { coefficient: 1, paulis: "IZ" }] });
    expect(close(v, 2)).toBe(true);
  });
});
