import { describe, test, expect } from "vitest";
import { simultaneousRb } from "../src/sim/simultaneousRb";
import { DEFAULT_NOISE } from "../src/sim/noise";

const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

describe("simultaneousRb", () => {
  test("no crosstalk: addressability = 1 exactly (paired iso/simultaneous runs)", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 60, oneQubitDepolarising: 0.04, crosstalk: 0 };
    const r = simultaneousRb(noise, { qubits: [0, 1], lengths: [1, 4, 16, 48], sequences: 14, rng: mulberry32(1) });
    for (let i = 0; i < r.qubits.length; i++) expect(r.simultaneous[i]).toBeCloseTo(r.isolated[i], 12);
    expect(r.meanAddressability).toBeCloseTo(1, 9);
  });

  test("crosstalk + coupling: simultaneous EPC exceeds isolated (addressability > 1)", () => {
    const noise = {
      ...DEFAULT_NOISE, enabled: true, trajectories: 200,
      oneQubitDepolarising: 0.01, crosstalk: 0.08,
      coupling: [[1], [0]],
    };
    const r = simultaneousRb(noise, { qubits: [0, 1], lengths: [1, 2, 4, 8, 16, 32], sequences: 20, rng: mulberry32(2) });
    for (let i = 0; i < r.qubits.length; i++) expect(r.simultaneous[i]).toBeGreaterThan(r.isolated[i]);
    expect(r.meanAddressability).toBeGreaterThan(1);
  });

  test("output arrays align with the qubit list", () => {
    const noise = { ...DEFAULT_NOISE, enabled: true, trajectories: 20, oneQubitDepolarising: 0.03 };
    const r = simultaneousRb(noise, { qubits: [0, 1, 2], lengths: [1, 4], sequences: 4, rng: mulberry32(3) });
    expect(r.qubits).toEqual([0, 1, 2]);
    expect(r.isolated).toHaveLength(3);
    expect(r.simultaneous).toHaveLength(3);
    expect(r.addressability).toHaveLength(3);
  });
});
