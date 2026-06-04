import { describe, test, expect } from "vitest";
import { isCliffordOnly, runClifford, sampleSyndromes } from "../src/sim/stabilizer";
import { mulberry32 } from "../src/sim/measure";

type G = Parameters<typeof runClifford>[1][number];
const g = (gateId: string, targets: number[], controls: number[] = [], clbits: number[] = []): G =>
  ({ gateId, targets, controls, clbits });

describe("isCliffordOnly", () => {
  test("H/S/CX/measure circuit is Clifford", () => {
    expect(isCliffordOnly([{ gateId: "h" }, { gateId: "cx" }, { gateId: "s" }, { gateId: "measure" }])).toBe(true);
  });
  test("a single T breaks Cliffordness", () => {
    expect(isCliffordOnly([{ gateId: "h" }, { gateId: "t" }])).toBe(false);
  });
  test("an arbitrary rotation breaks Cliffordness", () => {
    expect(isCliffordOnly([{ gateId: "rx" }])).toBe(false);
  });
});

describe("tableau measurement correlations", () => {
  test("GHZ: all qubits measure to the same value, and both 0…0 and 1…1 occur", () => {
    const ghz = [g("h", [0]), g("cx", [1], [0]), g("cx", [2], [1]),
      g("measure", [0], [], [0]), g("measure", [1], [], [1]), g("measure", [2], [], [2])];
    let saw000 = false, saw111 = false;
    for (let seed = 0; seed < 50; seed++) {
      const { classical } = runClifford(3, ghz, mulberry32(seed + 1), 3);
      const [a, b, c] = [classical[0], classical[1], classical[2]];
      expect(a).toBe(b);
      expect(b).toBe(c);
      if (a === 0) saw000 = true; else saw111 = true;
    }
    expect(saw000).toBe(true);
    expect(saw111).toBe(true);
  });

  test("Bell pair outcomes are perfectly correlated", () => {
    const bell = [g("h", [0]), g("cx", [1], [0]), g("measure", [0], [], [0]), g("measure", [1], [], [1])];
    for (let seed = 0; seed < 30; seed++) {
      const { classical } = runClifford(2, bell, mulberry32(seed + 100), 2);
      expect(classical[0]).toBe(classical[1]);
    }
  });

  test("X·measure deterministically yields 1", () => {
    const { classical } = runClifford(1, [g("x", [0]), g("measure", [0], [], [0])], mulberry32(5), 1);
    expect(classical[0]).toBe(1);
  });
});

describe("sampleSyndromes histogram", () => {
  test("Bell pair yields only 00 and 11, ~50/50", () => {
    const bell = [g("h", [0]), g("cx", [1], [0]), g("measure", [0], [], [0]), g("measure", [1], [], [1])];
    const hist = sampleSyndromes(2, bell, 2, 4000);
    const keys = [...hist.keys()].sort();
    expect(keys).toEqual(["00", "11"]);
    const c00 = hist.get("00") ?? 0;
    expect(c00 / 4000).toBeGreaterThan(0.4);
    expect(c00 / 4000).toBeLessThan(0.6);
  });

  test("large Clifford circuit (n=40) runs via the tableau without error", () => {
    const gates: G[] = [g("h", [0])];
    for (let q = 1; q < 40; q++) gates.push(g("cx", [q], [q - 1]));
    for (let q = 0; q < 40; q++) gates.push(g("measure", [q], [], [q]));
    const hist = sampleSyndromes(40, gates, 40, 200);
    // GHZ-40: every shot is all-zeros or all-ones.
    for (const key of hist.keys()) {
      expect(key === "0".repeat(40) || key === "1".repeat(40)).toBe(true);
    }
  });
});
