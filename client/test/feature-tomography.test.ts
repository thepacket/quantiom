import { describe, test, expect } from "vitest";
import { processTomography } from "../src/sim/tomography";
import { circ, gate } from "./helpers";

const mag = (z: { re: number; im: number }) => Math.hypot(z.re, z.im);

// β_P = Tr(P† U) / 2ⁿ, so a single Pauli gate concentrates β on that Pauli.
describe("processTomography", () => {
  test("identity gate → β concentrated on I", () => {
    const r = processTomography(circ(1, [gate("i", [0])]), {}, []);
    expect(r.n).toBe(1);
    expect(r.labels).toEqual(["I", "X", "Y", "Z"]);
    expect(mag(r.beta[0])).toBeCloseTo(1, 6);
    for (let k = 1; k < 4; k++) expect(mag(r.beta[k])).toBeLessThan(1e-6);
  });

  test("X gate → β concentrated on X; χ[X][X] ≈ 1", () => {
    const r = processTomography(circ(1, [gate("x", [0])]), {}, []);
    expect(mag(r.beta[1])).toBeCloseTo(1, 6);
    expect(mag(r.beta[0])).toBeLessThan(1e-6);
    expect(mag(r.chi[1][1])).toBeCloseTo(1, 6);
  });

  test("H gate → β split equally between X and Z", () => {
    const r = processTomography(circ(1, [gate("h", [0])]), {}, []);
    expect(mag(r.beta[1])).toBeCloseTo(Math.SQRT1_2, 6); // X
    expect(mag(r.beta[3])).toBeCloseTo(Math.SQRT1_2, 6); // Z
    expect(mag(r.beta[0])).toBeLessThan(1e-6);            // I
    expect(mag(r.beta[2])).toBeLessThan(1e-6);            // Y
  });

  test("χ is trace-normalized (Σ |β|² ≈ 1 for a unitary process)", () => {
    const r = processTomography(circ(1, [gate("ry", [0], [], ["0.9"])]), {}, []);
    const tr = r.beta.reduce((s, b) => s + mag(b) ** 2, 0);
    expect(tr).toBeCloseTo(1, 6);
  });
});
