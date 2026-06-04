import { describe, test, expect } from "vitest";
import { randomCliffordCircuit } from "../src/sim/randomClifford";
import { isCliffordOnly } from "../src/sim/stabilizer";
import type { Circuit } from "../src/editor/types";

const sig = (c: Circuit) =>
  c.gates.map((g) => `${g.gateId}:[${g.controls}]:[${g.targets}]:${g.column}`).join("|");

describe("randomCliffordCircuit", () => {
  test("produces a Clifford-only circuit of the requested width and depth", () => {
    const c = randomCliffordCircuit({ numQubits: 5, depth: 8, seed: 1 });
    expect(c.numQubits).toBe(5);
    expect(isCliffordOnly(c.gates)).toBe(true);
    expect(c.gates.length).toBeGreaterThan(0);
    for (const g of c.gates) expect(g.column).toBeLessThan(8);
  });

  test("the same seed is deterministic; a different seed differs", () => {
    const a = randomCliffordCircuit({ numQubits: 4, depth: 6, seed: 42 });
    const b = randomCliffordCircuit({ numQubits: 4, depth: 6, seed: 42 });
    const c = randomCliffordCircuit({ numQubits: 4, depth: 6, seed: 43 });
    expect(sig(a)).toBe(sig(b));
    expect(sig(a)).not.toBe(sig(c));
  });

  test("depth 0 yields an empty circuit", () => {
    const c = randomCliffordCircuit({ numQubits: 3, depth: 0, seed: 1 });
    expect(c.gates.length).toBe(0);
    expect(c.numQubits).toBe(3);
  });
});
