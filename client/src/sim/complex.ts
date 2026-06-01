/**
 * Complex number helpers used by gate-matrix builders. Matrix entries are
 * `[re, im]` tuples for compactness; state vectors live in a Float64Array
 * with re/im interleaved for cache locality.
 */

export type Complex = readonly [re: number, im: number];

export const ZERO: Complex = [0, 0];
export const ONE: Complex = [1, 0];
export const I: Complex = [0, 1];
export const NEG_I: Complex = [0, -1];

export function c(re: number, im = 0): Complex {
  return [re, im];
}

export function neg(a: Complex): Complex {
  return [-a[0], -a[1]];
}

export function cmul(a: Complex, b: Complex): Complex {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

export function cscale(a: Complex, k: number): Complex {
  return [a[0] * k, a[1] * k];
}

export function expi(theta: number): Complex {
  return [Math.cos(theta), Math.sin(theta)];
}
