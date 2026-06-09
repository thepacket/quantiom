import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { buildClassicalShadows, estimatePauli, estimateAllZ } from "../src/sim/classicalShadows";
import { mulberry32 } from "../src/sim/measure";

const shadow = (n: number, gates: ReturnType<typeof gate>[], shots = 4000) =>
  buildClassicalShadows(circ(n, gates), {}, [], shots, mulberry32(12345))!;

describe("classical shadows", () => {
  it("estimates ⟨Z⟩ = 1 on |0⟩", () => {
    const sh = shadow(1, []);
    expect(estimatePauli(sh, "Z")!).toBeGreaterThan(0.85);
  });

  it("estimates ⟨X⟩ = 1 and ⟨Z⟩ ≈ 0 on |+⟩", () => {
    const sh = shadow(1, [gate("h", [0])]);
    expect(estimatePauli(sh, "X")!).toBeGreaterThan(0.8);
    expect(Math.abs(estimatePauli(sh, "Z")!)).toBeLessThan(0.2);
  });

  it("estimates Bell correlations ⟨ZZ⟩ ≈ ⟨XX⟩ ≈ 1, ⟨YY⟩ ≈ −1, ⟨ZI⟩ ≈ 0", () => {
    const sh = shadow(2, [gate("h", [0]), gate("cx", [1], [0])]);
    expect(estimatePauli(sh, "ZZ")!).toBeGreaterThan(0.7);
    expect(estimatePauli(sh, "XX")!).toBeGreaterThan(0.7);
    expect(estimatePauli(sh, "YY")!).toBeLessThan(-0.7);
    expect(Math.abs(estimatePauli(sh, "ZI")!)).toBeLessThan(0.25);
  });

  it("estimateAllZ matches per-qubit ⟨Z⟩", () => {
    const sh = shadow(2, [gate("x", [0])]); // q0 = |1⟩ (Z=−1), q1 = |0⟩ (Z=+1)
    const z = estimateAllZ(sh);
    expect(z[0]).toBeLessThan(-0.8);
    expect(z[1]).toBeGreaterThan(0.8);
  });

  it("rejects bad / wrong-length Pauli strings", () => {
    const sh = shadow(2, []);
    expect(estimatePauli(sh, "Z")).toBeNull(); // wrong length
    expect(estimatePauli(sh, "QQ")).toBeNull(); // bad chars
  });
});
