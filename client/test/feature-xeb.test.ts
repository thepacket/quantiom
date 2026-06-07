import { describe, test, expect } from "vitest";
import { buildXebCircuit, xeb } from "../src/sim/xeb";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("buildXebCircuit", () => {
  test("depth d emits d single-qubit layers (no immediate repeats on a qubit)", () => {
    const c = buildXebCircuit(4, 5, mulberry32(1));
    expect(c.numQubits).toBe(4);
    const sq = c.gates.filter((g) => ["sx", "sy", "t"].includes(g.gateId));
    expect(sq.length).toBe(4 * 5); // 4 qubits × 5 cycles
  });
});

describe("xeb", () => {
  test("clean model: linear XEB fidelity ≈ 1 at every depth", () => {
    const clean = { ...DEFAULT_NOISE, enabled: false };
    const r = xeb(clean, { numQubits: 3, depths: [1, 2, 4, 8], circuits: 6, rng: mulberry32(2) });
    for (const f of r.fidelity) expect(f).toBeCloseTo(1, 6);
    expect(r.perCycle).toBeCloseTo(1, 2);
  });

  test("noise decays the fidelity per cycle (λ < 1)", () => {
    const noisy = { ...DEFAULT_NOISE, enabled: true, trajectories: 40, oneQubitDepolarising: 0.03, twoQubitDepolarising: 0.05 };
    const r = xeb(noisy, { numQubits: 3, depths: [1, 4, 8, 16], circuits: 6, rng: mulberry32(8) });
    expect(r.fidelity[r.fidelity.length - 1]).toBeLessThan(r.fidelity[0]);
    expect(r.perCycle).toBeLessThan(1);
  });
});
