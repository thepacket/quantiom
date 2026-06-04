import { describe, test, expect } from "vitest";
import { parsePauliSum, pauliSumQubitCount, buildTrotterCircuit, type TrotterOrder } from "../src/sim/trotter";
import { simulate } from "../src/sim/simulate";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
function probOf(res: ReturnType<typeof simulate>, label: string): number {
  const a = res.amplitudes.find((x) => x.basis === label);
  return a ? a.re * a.re + a.im * a.im : 0;
}

describe("parsePauliSum", () => {
  test("parses coefficients and signs", () => {
    expect(parsePauliSum("0.5 ZZ - 0.25 XI")).toEqual([
      { coefficient: 0.5, paulis: "ZZ" },
      { coefficient: -0.25, paulis: "XI" },
    ]);
  });
  test("implicit coefficient of 1", () => {
    expect(parsePauliSum("X")).toEqual([{ coefficient: 1, paulis: "X" }]);
  });
  test("rejects mismatched widths", () => {
    expect(() => parsePauliSum("X + ZZ")).toThrow();
  });
  test("qubit count is the Pauli-string width", () => {
    expect(pauliSumQubitCount(parsePauliSum("ZZI + IXX"))).toBe(3);
  });
});

describe("buildTrotterCircuit", () => {
  test("single-term e^{-iδX} on |0⟩ equals RX(2δ) — exact for one term", () => {
    // H = 1·X, one Trotter step. The elementary step is Rz(2δ) in the X basis
    // = RX(2δ). With δ = t = π/4 ⇒ RX(π/2)|0⟩ ⇒ 50/50.
    const c = buildTrotterCircuit(parsePauliSum("1.0 X"), { steps: 1, delta: "t" });
    const r = simulate(c, { t: Math.PI / 4 });
    expect(close(probOf(r, "1"), 0.5, 1e-9)).toBe(true);
  });

  test("Z-only Hamiltonian leaves computational populations unchanged", () => {
    const c = buildTrotterCircuit(parsePauliSum("1.0 Z"), { steps: 2, delta: "t" });
    const r = simulate(c, { t: 0.6 });
    // exp(-iθZ) is diagonal ⇒ |0⟩ stays |0⟩ in probability.
    expect(close(probOf(r, "0"), 1, 1e-9)).toBe(true);
  });

  test("all Trotter orders and qdrift build a runnable circuit", () => {
    const terms = parsePauliSum("0.5 ZZ + 0.3 XI + 0.3 IX");
    for (const order of [1, 2, 4] as TrotterOrder[]) {
      const c = buildTrotterCircuit(terms, { steps: 2, delta: "t", order });
      expect(c.numQubits).toBe(2);
      expect(c.gates.length).toBeGreaterThan(0);
      const r = simulate(c, { t: 0.2 });
      expect(close(r.probabilities.reduce((a, b) => a + b, 0), 1, 1e-9)).toBe(true);
    }
    const q = buildTrotterCircuit(terms, { steps: 1, delta: "t", mode: "qdrift", samples: 8 });
    expect(q.numQubits).toBe(2);
    expect(q.gates.length).toBeGreaterThan(0);
  });
});
