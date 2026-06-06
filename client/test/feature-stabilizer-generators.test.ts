import { describe, test, expect } from "vitest";
import { runClifford } from "../src/sim/stabilizer";
import { mulberry32 } from "../src/sim/measure";
import type { PlacedGate } from "../src/editor/types";
import { gate } from "./helpers";

const stabsOf = (n: number, gates: PlacedGate[]): string[] =>
  runClifford(n, gates, mulberry32(1), Math.max(1, 0)).tab.stabilizers();

describe("Stabilizer.stabilizers()", () => {
  test("|0…0⟩ is stabilised by Z on each qubit", () => {
    expect(stabsOf(1, [])).toEqual(["+Z"]);
    expect(stabsOf(3, [])).toEqual(["+ZII", "+IZI", "+IIZ"]);
  });

  test("X|0⟩ = |1⟩ flips the sign: −Z", () => {
    expect(stabsOf(1, [gate("x", [0])])).toEqual(["-Z"]);
  });

  test("H|0⟩ = |+⟩ is stabilised by +X", () => {
    expect(stabsOf(1, [gate("h", [0])])).toEqual(["+X"]);
  });

  test("Z·H|0⟩ = |−⟩ is stabilised by −X", () => {
    expect(stabsOf(1, [gate("h", [0], [], [], 0), gate("z", [0], [], [], 1)])).toEqual(["-X"]);
  });

  test("S·H|0⟩ = |+i⟩ is stabilised by +Y", () => {
    expect(stabsOf(1, [gate("h", [0], [], [], 0), gate("s", [0], [], [], 1)])).toEqual(["+Y"]);
  });

  test("Bell pair: two length-2 generators, both '+', from {XX, ZZ, YY}", () => {
    const s = stabsOf(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
    expect(s).toHaveLength(2);
    for (const g of s) {
      expect(g).toHaveLength(3); // sign + 2 Paulis
      expect(["XX", "ZZ", "YY"]).toContain(g.slice(1));
    }
    // The two generators must be independent (different Pauli content).
    expect(s[0].slice(1)).not.toBe(s[1].slice(1));
  });

  test("generators commute pairwise (a valid stabilizer group)", () => {
    // GHZ on 3 qubits.
    const s = stabsOf(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]);
    expect(s).toHaveLength(3);
    const anticommutes = (a: string, b: string) => {
      let parity = 0;
      for (let i = 0; i < a.length; i++) {
        const p = a[i], q = b[i];
        if (p !== "I" && q !== "I" && p !== q) parity ^= 1;
      }
      return parity === 1;
    };
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++)
        expect(anticommutes(s[i].slice(1), s[j].slice(1))).toBe(false);
  });
});
