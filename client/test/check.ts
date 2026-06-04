import { test, expect } from "vitest";

/**
 * Adapter that lets the project's original verification scripts — which
 * call `check(name, cond, detail)` at module top level — register as real
 * Vitest cases with zero rewriting of their assertion logic.
 *
 * The condition is computed eagerly (during collection, when the script's
 * top-level code runs) and asserted inside the registered test body. Every
 * `check` becomes one named `test`, so failures point at the exact identity
 * that broke, with the script's own detail string attached.
 */
export function check(name: string, cond: boolean, detail = ""): void {
  test(name, () => {
    expect(cond, detail).toBe(true);
  });
}
