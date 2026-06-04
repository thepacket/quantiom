import { describe, test, expect } from "vitest";
import { evalExpr, detectFreeVars, compileExpr } from "../src/sim/expr";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-12;

describe("parameter expression evaluator", () => {
  test("arithmetic", () => {
    expect(evalExpr("2 + 3 * 4", {})).toBe(14);
    expect(evalExpr("(2 + 3) * 4", {})).toBe(20);
    expect(close(evalExpr("1/2", {}), 0.5)).toBe(true);
  });

  test("pi constant in ASCII and glyph forms", () => {
    expect(close(evalExpr("pi", {}), Math.PI)).toBe(true);
    expect(close(evalExpr("π", {}), Math.PI)).toBe(true);
    expect(close(evalExpr("π/2", {}), Math.PI / 2)).toBe(true);
    expect(close(evalExpr("2*pi", {}), 2 * Math.PI)).toBe(true);
  });

  test("math functions", () => {
    expect(close(evalExpr("sin(pi/2)", {}), 1)).toBe(true);
    expect(close(evalExpr("cos(0)", {}), 1)).toBe(true);
    expect(close(evalExpr("sqrt(2)", {}), Math.SQRT2)).toBe(true);
    expect(close(evalExpr("exp(0)", {}), 1)).toBe(true);
  });

  test("free variables resolve from scope", () => {
    expect(close(evalExpr("theta + 1", { theta: 2 }), 3)).toBe(true);
    expect(close(evalExpr("a*b", { a: 3, b: 4 }), 12)).toBe(true);
  });

  test("Greek glyph free variable maps to ASCII name", () => {
    expect(close(evalExpr("θ/2", { theta: Math.PI }), Math.PI / 2)).toBe(true);
  });

  test("detectFreeVars excludes constants and functions", () => {
    expect(detectFreeVars("sin(theta) + pi").sort()).toEqual(["theta"]);
    expect(detectFreeVars("2*pi")).toEqual([]);
    expect(detectFreeVars("a + b*c").sort()).toEqual(["a", "b", "c"]);
  });

  test("compileExpr caches free vars and evaluates repeatedly", () => {
    const e = compileExpr("k*x");
    expect(e.freeVars.sort()).toEqual(["k", "x"]);
    expect(e.eval({ k: 2, x: 5 })).toBe(10);
    expect(e.eval({ k: 3, x: 5 })).toBe(15);
  });

  test("missing scope vars default to 0, not NaN", () => {
    expect(evalExpr("x + 1", {})).toBe(1);
  });

  test("malformed expression degrades gracefully rather than throwing", () => {
    expect(() => evalExpr("2 +* 3", {})).not.toThrow();
    // A non-compilable expression yields NaN (compileExpr's failure sentinel).
    expect(Number.isNaN(evalExpr("2 +* 3", {}))).toBe(true);
  });
});
