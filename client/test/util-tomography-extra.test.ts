import { describe, test, expect } from "vitest";
import { processTomography } from "../src/sim/tomography";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless: NoiseModel = {
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0,
};

const sumSq = (r: { beta: { re: number; im: number }[] }) =>
  r.beta.reduce((s, b) => s + b.re * b.re + b.im * b.im, 0);

describe("processTomography — multi-qubit (Kronecker path)", () => {
  test("CX decomposes into the 4 Paulis II/IX/ZI/ZX with Σ|β|² ≈ 1", () => {
    const r = processTomography(circ(2, [gate("cx", [1], [0])]), {}, []);
    expect(r.n).toBe(2);
    expect(r.labels).toHaveLength(16);
    expect(sumSq(r)).toBeCloseTo(1, 6);
    // CX = ½(II + IX + ZI − ZX): each of the four has |β| ≈ 0.5.
    const big = r.labels.filter((_, i) => Math.hypot(r.beta[i].re, r.beta[i].im) > 0.4);
    expect(big.sort()).toEqual(["II", "IX", "ZI", "ZX"]);
  });
});

describe("processTomography — caps and noise mode", () => {
  test("rejects circuits past the 4-qubit cap", () => {
    expect(() => processTomography(circ(5, [gate("h", [0])]), {}, [])).toThrow(/capped at 4 qubits/);
  });

  test("noise mode routes columns through the trajectory simulator", () => {
    // Noiseless model + 1 trajectory ⇒ the representative state is exact, so
    // an X gate still decomposes cleanly onto the X Pauli.
    const r = processTomography(circ(1, [gate("x", [0])]), {}, [], noiseless);
    let best = 0;
    for (let i = 1; i < r.beta.length; i++) {
      if (Math.hypot(r.beta[i].re, r.beta[i].im) > Math.hypot(r.beta[best].re, r.beta[best].im)) best = i;
    }
    expect(r.labels[best]).toBe("X");
  });
});
