import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { entanglementContour } from "../src/sim/entanglementContour";
import { schmidtGap } from "../src/sim/schmidtGap";
import { renyiSpectrum } from "../src/sim/renyiSpectrum";
import { correlationLength } from "../src/sim/correlationLength";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function bell() {
  return simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
}
function ghz(n: number) {
  const gates = [gate("h", [0])];
  for (let q = 1; q < n; q++) gates.push(gate("cx", [q], [q - 1]));
  return simulate(circ(n, gates), {}).state;
}

describe("entanglementContour", () => {
  test("Bell, region 1: contour = [1 bit], total 1", () => {
    const r = entanglementContour(bell(), 2, 1)!;
    expect(r.contour.length).toBe(1);
    expect(close(r.contour[0], 1)).toBe(true);
    expect(close(r.total, 1)).toBe(true);
  });

  test("product state contour is zero", () => {
    const r = entanglementContour(simulate(circ(3, [gate("x", [1])]), {}).state, 3, 1)!;
    expect(close(r.total, 0)).toBe(true);
  });

  test("contour telescopes to S(A)", () => {
    const r = entanglementContour(ghz(4), 4, 2)!;
    const sum = r.contour.reduce((a, b) => a + b, 0);
    expect(close(sum, r.total)).toBe(true);
  });
});

describe("schmidtGap", () => {
  test("Bell cut is degenerate (gap 0)", () => {
    const r = schmidtGap(bell(), 2)!;
    expect(close(r.gap[0], 0)).toBe(true);
  });

  test("product cut has full gap 1", () => {
    const r = schmidtGap(simulate(circ(2, [gate("x", [1])]), {}).state, 2)!;
    expect(close(r.gap[0], 1)).toBe(true);
  });
});

describe("renyiSpectrum", () => {
  test("Bell cut: S_α = 1 for all α (flat spectrum)", () => {
    const r = renyiSpectrum(bell(), 2, [0])!;
    for (const s of r.entropies) expect(close(s, 1, 1e-6)).toBe(true);
    expect(close(r.vonNeumann, 1)).toBe(true);
    expect(close(r.min, 1)).toBe(true);
  });

  test("product cut: S_α = 0", () => {
    const r = renyiSpectrum(simulate(circ(2, [gate("x", [1])]), {}).state, 2, [0])!;
    for (const s of r.entropies) expect(close(s, 0)).toBe(true);
  });
});

describe("correlationLength", () => {
  test("GHZ has uniform correlations ⇒ ξ → ∞", () => {
    const r = correlationLength(ghz(4), 4)!;
    // g(r) constant ⇒ slope 0 ⇒ no decay.
    expect(Number.isFinite(r.xi)).toBe(false);
  });

  test("product state has no correlations", () => {
    const r = correlationLength(simulate(circ(4, [gate("x", [1])]), {}).state, 4)!;
    for (const v of r.g) expect(close(v, 0)).toBe(true);
  });
});
