import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { spinSqueezing } from "../src/sim/spinSqueezing";
import { observableMoments, shotError } from "../src/sim/observableVariance";
import { characteristicFunction } from "../src/sim/charFunction";
import { gateFidelityMetrics } from "../src/sim/gateFidelity";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function allH(n: number) {
  return simulate(circ(n, Array.from({ length: n }, (_, q) => gate("h", [q]))), {}).state;
}
function ghz(n: number) {
  const gates = [gate("h", [0])];
  for (let q = 1; q < n; q++) gates.push(gate("cx", [q], [q - 1]));
  return simulate(circ(n, gates), {}).state;
}

describe("spinSqueezing", () => {
  test("coherent product |0…0⟩ has ξ²_R = 1 (not squeezed)", () => {
    const r = spinSqueezing(simulate(circ(4, []), {}).state, 4)!;
    expect(close(r.xiR2, 1, 1e-5)).toBe(true);
    expect(r.squeezed).toBe(false);
  });

  test("coherent |+…+⟩ also sits at the SQL", () => {
    const r = spinSqueezing(allH(4), 4)!;
    expect(close(r.xiR2, 1, 1e-5)).toBe(true);
  });

  test("GHZ has zero mean spin ⇒ ξ²_R undefined", () => {
    const r = spinSqueezing(ghz(4), 4)!;
    expect(close(r.meanLength, 0, 1e-6)).toBe(true);
    expect(Number.isFinite(r.xiR2)).toBe(false);
    expect(r.squeezed).toBe(false);
  });
});

describe("observableMoments", () => {
  test("⟨Z⟩ on |0⟩: mean 1, variance 0", () => {
    const s = simulate(circ(1, []), {}).state;
    const m = observableMoments(s, 1, [{ coefficient: 1, paulis: "Z" }]);
    expect(close(m.mean, 1)).toBe(true);
    expect(close(m.variance, 0)).toBe(true);
  });

  test("⟨X⟩ on |0⟩: mean 0, variance 1, std 1", () => {
    const s = simulate(circ(1, []), {}).state;
    const m = observableMoments(s, 1, [{ coefficient: 1, paulis: "X" }]);
    expect(close(m.mean, 0)).toBe(true);
    expect(close(m.variance, 1)).toBe(true);
    expect(close(m.std, 1)).toBe(true);
  });

  test("⟨Z⟩ on |+⟩: mean 0, variance 1", () => {
    const s = simulate(circ(1, [gate("h", [0])]), {}).state;
    const m = observableMoments(s, 1, [{ coefficient: 1, paulis: "Z" }]);
    expect(close(m.mean, 0)).toBe(true);
    expect(close(m.variance, 1)).toBe(true);
  });

  test("shotError scales as σ/√N", () => {
    expect(close(shotError(1, 100), 0.1)).toBe(true);
    expect(close(shotError(2, 4), 1)).toBe(true);
  });
});

describe("characteristicFunction", () => {
  test("|0⟩: χ(0,0)=1 and the Z-cell =1, total = 2", () => {
    const r = characteristicFunction(simulate(circ(1, []), {}).state, 1)!;
    expect(close(r.mag[0][0], 1)).toBe(true); // I
    expect(close(r.mag[0][1], 1)).toBe(true); // Z → (u=0, v=1)
    expect(close(r.mag[1][0], 0)).toBe(true); // X
    expect(close(r.total, 2)).toBe(true);
  });

  test("origin χ(0,0) = 1 for any state", () => {
    const r = characteristicFunction(simulate(circ(2, [gate("h", [0]), gate("t", [1])]), {}).state, 2)!;
    expect(close(r.mag[0][0], 1)).toBe(true);
  });
});

describe("gateFidelityMetrics", () => {
  test("perfect process fidelity ⇒ unit gate fidelity, zero diamond bounds", () => {
    const g = gateFidelityMetrics(1, 3);
    expect(close(g.avgGateFidelity, 1)).toBe(true);
    expect(close(g.avgGateInfidelity, 0)).toBe(true);
    expect(close(g.diamondLower, 0)).toBe(true);
    expect(close(g.diamondUpper, 0)).toBe(true);
  });

  test("F=0, 1 qubit (d=2): F̄ = 1/3, diamond upper = 2", () => {
    const g = gateFidelityMetrics(0, 1);
    expect(close(g.avgGateFidelity, 1 / 3)).toBe(true);
    expect(close(g.diamondUpper, 2)).toBe(true);
  });

  test("F̄ ≥ F_pro (averaging lifts the process fidelity)", () => {
    const g = gateFidelityMetrics(0.9, 2);
    expect(g.avgGateFidelity).toBeGreaterThan(0.9);
  });
});
