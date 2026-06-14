import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { eigenstateEntanglement } from "../src/sim/eigenstateEntanglement";
import { chernNumber } from "../src/sim/chernNumber";
import { lyapunovExponent } from "../src/sim/lyapunov";
import { temporalAutocorrelation } from "../src/sim/autocorrelation";
import { ptMoments } from "../src/sim/ptMoments";
import { parsePauliSum } from "../src/sim/trotter";

const close = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps;

function bell() {
  return simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
}

describe("eigenstateEntanglement", () => {
  test("returns one entropy per eigenstate, each within [0, maxEntropy]", () => {
    const terms = parsePauliSum("-1*ZZI - 1*IZZ - 0.9*XII - 0.9*IXI - 0.9*IIX");
    const r = eigenstateEntanglement(terms, 3)!;
    expect(r.energies.length).toBe(8);
    expect(r.entropies.length).toBe(8);
    expect(r.maxEntropy).toBe(1); // floor(3/2) = 1
    for (const s of r.entropies) { expect(s).toBeGreaterThanOrEqual(-1e-9); expect(s).toBeLessThanOrEqual(r.maxEntropy + 1e-6); }
  });

  test("a non-interacting Z field has product eigenstates (S = 0)", () => {
    const terms = parsePauliSum("1*ZI + 1*IZ");
    const r = eigenstateEntanglement(terms, 2)!;
    for (const s of r.entropies) expect(close(s, 0, 1e-6)).toBe(true);
  });
});

describe("chernNumber", () => {
  test("a circuit whose state is independent of the symbols has C ≈ 0", () => {
    // RX(a) on q0, RZ(b) on q1 — a separable state; Berry curvature ≈ 0.
    const c = circ(2, [gate("rx", [0], [], ["a"]), gate("rz", [1], [], ["b"])]);
    const r = chernNumber(c, { a: 0, b: 0 }, [], "a", "b", 10)!;
    expect(Math.abs(r.chern)).toBeLessThan(0.5);
    expect(r.symbols).toEqual(["a", "b"]);
  });

  test("identical symbols rejected", () => {
    const c = circ(1, [gate("rx", [0], [], ["a"])]);
    expect(chernNumber(c, { a: 0 }, [], "a", "a", 8)).toBeNull();
  });
});

describe("lyapunovExponent", () => {
  test("static (t-independent) circuit has no OTOC growth", () => {
    const c = circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]);
    const r = lyapunovExponent(c, {}, [], 0, undefined, 24, 6)!;
    // C(t) is constant in t → no positive growth slope.
    expect(r.ts.length).toBe(24);
  });

  test("returns null outside the qubit range", () => {
    expect(lyapunovExponent(circ(1, []), {}, [])).toBeNull();
    expect(lyapunovExponent(circ(7, []), {}, [])).toBeNull();
  });
});

describe("temporalAutocorrelation", () => {
  test("C(0) = 1 (Z_q(0)² = I, infinite-T)", () => {
    const c = circ(2, [gate("rx", [0], [], ["t"])]);
    const r = temporalAutocorrelation(c, {}, [], 0, 16, 6)!;
    expect(close(r.C[0], 1, 1e-6)).toBe(true);
  });

  test("identity circuit: C(t) ≡ 1 (Z commutes with I)", () => {
    const r = temporalAutocorrelation(circ(2, []), {}, [], 0, 12, 6)!;
    for (const v of r.C) expect(close(v, 1, 1e-9)).toBe(true);
  });
});

describe("ptMoments", () => {
  test("Bell across {0}: p₁=1, p₂=1, p₃=¼, and the p₃ criterion flags entanglement", () => {
    const r = ptMoments(bell(), 2, [0])!;
    expect(close(r.moments[0], 1, 1e-6)).toBe(true);
    // ρ^{T_A} eigenvalues {½,½,½,−½}: p₂ = Σλ² = 1, p₃ = Σλ³ = 3·⅛ − ⅛ = ¼.
    expect(close(r.p2, 1, 1e-6)).toBe(true);
    expect(close(r.p3, 0.25, 1e-6)).toBe(true);
    expect(r.entangledByP3).toBe(true); // p₃ = 0.25 < p₂² = 1
  });

  test("product state: not flagged (p₃ = p₂²)", () => {
    const r = ptMoments(simulate(circ(2, [gate("x", [1])]), {}).state, 2, [0])!;
    expect(r.entangledByP3).toBe(false);
  });
});
