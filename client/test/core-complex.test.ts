import { describe, test, expect } from "vitest";
import { c, neg, cmul, cscale, expi, ZERO, ONE, I, NEG_I } from "../src/sim/complex";

describe("complex helpers", () => {
  test("constants", () => {
    expect(ZERO).toEqual([0, 0]);
    expect(ONE).toEqual([1, 0]);
    expect(I).toEqual([0, 1]);
    expect(NEG_I).toEqual([0, -1]);
  });

  test("c() builds a tuple, imag defaults to 0", () => {
    expect(c(3)).toEqual([3, 0]);
    expect(c(3, -2)).toEqual([3, -2]);
  });

  test("neg negates both parts", () => {
    expect(neg([2, -3])).toEqual([-2, 3]);
  });

  test("cmul: i·i = -1", () => {
    expect(cmul(I, I)).toEqual([-1, 0]);
  });

  test("cmul: (1+2i)(3+4i) = -5+10i", () => {
    const [re, im] = cmul([1, 2], [3, 4]);
    expect(re).toBeCloseTo(-5, 12);
    expect(im).toBeCloseTo(10, 12);
  });

  test("cscale multiplies by a real scalar", () => {
    expect(cscale([2, -3], 4)).toEqual([8, -12]);
  });

  test("expi(θ) = cosθ + i·sinθ", () => {
    const [re, im] = expi(Math.PI / 3);
    expect(re).toBeCloseTo(0.5, 12);
    expect(im).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  test("expi(π) = -1", () => {
    const [re, im] = expi(Math.PI);
    expect(re).toBeCloseTo(-1, 12);
    expect(im).toBeCloseTo(0, 12);
  });
});
