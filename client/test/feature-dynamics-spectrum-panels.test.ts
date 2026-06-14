import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { imbalanceSweep } from "../src/sim/imbalance";
import { butterflyVelocity } from "../src/sim/butterflyVelocity";
import { densityOfStates } from "../src/sim/densityOfStates";
import { berryPhase } from "../src/sim/berryPhase";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("imbalanceSweep", () => {
  test("static Néel pattern |01⟩ gives imbalance ≡ 1", () => {
    const r = imbalanceSweep(circ(2, [gate("x", [1])]), {}, [])!;
    for (const v of r.imbalance) expect(close(v, 1, 1e-9)).toBe(true);
    expect(close(r.plateau, 1, 1e-9)).toBe(true);
  });

  test("uniform |00⟩ gives imbalance ≡ 0", () => {
    const r = imbalanceSweep(circ(2, []), {}, [])!;
    for (const v of r.imbalance) expect(close(v, 0, 1e-9)).toBe(true);
  });

  test("caps qubit count", () => {
    expect(imbalanceSweep(circ(20, []), {}, [], 8, 14)).toBeNull();
  });
});

describe("butterflyVelocity", () => {
  test("returns a series per non-reference qubit on a small circuit", () => {
    const c = circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]);
    const r = butterflyVelocity(c, {}, [], 0, "Z", "Z", 0.5, 16, 5)!;
    expect(r.series.length).toBe(2);
    expect(r.series[0].distance).toBe(1);
    expect(r.series[1].distance).toBe(2);
  });

  test("rejects out-of-range qubit counts", () => {
    expect(butterflyVelocity(circ(1, []), {}, [])).toBeNull();
    expect(butterflyVelocity(circ(8, []), {}, [])).toBeNull();
  });
});

describe("densityOfStates", () => {
  test("bins energies and counts sum to total", () => {
    const r = densityOfStates([0, 0, 1, 1, 2], 4)!;
    expect(r.total).toBe(5);
    expect(r.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(close(r.eMin, 0)).toBe(true);
    expect(close(r.eMax, 2)).toBe(true);
  });

  test("degenerate spectrum lands in a single bin", () => {
    const r = densityOfStates([3, 3, 3], 10)!;
    const populated = r.counts.filter((c) => c > 0).length;
    expect(populated).toBe(1);
    expect(Math.max(...r.counts)).toBe(3);
  });

  test("empty spectrum returns null", () => {
    expect(densityOfStates([], 8)).toBeNull();
  });
});

describe("berryPhase", () => {
  test("Bloch-sphere loop reproduces the half-solid-angle geometric phase", () => {
    // |ψ(θ,φ)⟩ = RZ(φ)·RY(θ)|0⟩ traces the Bloch sphere. A rectangular loop of
    // half-width r about θ0=π/2 encloses solid angle ΔΩ = 4r·sinθ0·sin r, and
    // the spin-½ Berry phase is |γ| = ½ΔΩ.
    const c = circ(1, [gate("ry", [0], [], ["theta"]), gate("rz", [0], [], ["phi"])]);
    const r = Math.PI / 4;
    const res = berryPhase(c, { theta: Math.PI / 2, phi: 0 }, [], "theta", "phi", r, 24)!;
    const expected = 0.5 * (4 * r * Math.sin(Math.PI / 2) * Math.sin(r));
    expect(Math.abs(Math.abs(res.gamma) - expected)).toBeLessThan(0.15);
    expect(res.overlapMagnitude).toBeLessThanOrEqual(1.0001);
  });

  test("γ stays wrapped to (−π, π] and symbols are reported", () => {
    const c = circ(1, [gate("ry", [0], [], ["a"]), gate("rz", [0], [], ["b"])]);
    const res = berryPhase(c, { a: 1, b: 0.5 }, [], "a", "b", Math.PI / 3, 16)!;
    expect(res.gamma).toBeGreaterThan(-Math.PI);
    expect(res.gamma).toBeLessThanOrEqual(Math.PI);
    expect(res.symbols).toEqual(["a", "b"]);
  });

  test("identical symbols are rejected", () => {
    const c = circ(1, [gate("ry", [0], [], ["a"])]);
    expect(berryPhase(c, { a: 1 }, [], "a", "a")).toBeNull();
  });
});
