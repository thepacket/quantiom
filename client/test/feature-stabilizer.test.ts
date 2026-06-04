import { describe, test, expect } from "vitest";
import { runClifford, runCliffordNoisy, sampleSyndromes, isCliffordOnly } from "../src/sim/stabilizer";
import { simulate } from "../src/sim/simulate";
import { mulberry32 } from "../src/sim/measure";
import { circ, gate } from "./helpers";
import type { PlacedGate } from "../src/editor/types";

const meas = (q: number, c: number): PlacedGate => ({ ...gate("measure", [q]), clbits: [c] });

// The full Clifford gate set the tableau implements.
const C1 = ["h", "s", "sdg", "x", "y", "z", "sx", "sxdg"];
const C2 = ["cx", "cy", "cz", "swap"];

function randomClifford(rand: () => number, n: number, count: number): PlacedGate[] {
  const gates: PlacedGate[] = [];
  for (let i = 0; i < count; i++) {
    if (n >= 2 && rand() < 0.35) {
      let a = Math.floor(rand() * n), b = Math.floor(rand() * n);
      while (b === a) b = Math.floor(rand() * n);
      const id = C2[Math.floor(rand() * C2.length)];
      if (id === "swap") gates.push(gate(id, [a, b], [], [], i));
      else gates.push(gate(id, [b], [a], [], i)); // control a → target b
    } else {
      gates.push(gate(C1[Math.floor(rand() * C1.length)], [Math.floor(rand() * n)], [], [], i));
    }
  }
  return gates;
}

// ── The headline check: tableau ≡ statevector on random Clifford circuits ─
describe("tableau sampling matches the statevector distribution (random Cliffords)", () => {
  test("12 seeded random 3-qubit Clifford circuits agree with the exact statevector", () => {
    const n = 3, dim = 1 << n, shots = 3000;
    for (let seed = 1; seed <= 12; seed++) {
      const gates = randomClifford(mulberry32(seed), n, 12);
      // Ground truth: exact probabilities from the statevector simulator.
      const P = simulate(circ(n, gates), {}).probabilities;
      // Tableau: measure every qubit, sample, build the basis distribution.
      const measured = [...gates, ...Array.from({ length: n }, (_, q) => meas(q, q))];
      const counts = new Float64Array(dim);
      for (let s = 0; s < shots; s++) {
        const { classical } = runClifford(n, measured, Math.random, n);
        let idx = 0;
        for (let q = 0; q < n; q++) idx |= classical[q] << (n - 1 - q); // qubit 0 = MSB
        counts[idx]++;
      }
      for (let i = 0; i < dim; i++) {
        expect(Math.abs(counts[i] / shots - P[i]), `seed ${seed} basis ${i}`).toBeLessThan(0.06);
      }
    }
  });
});

// ── measureZ: deterministic (§4.1) vs random (§4.2) ─────────────────────
describe("measureZ determinism", () => {
  test("|0⟩ measures 0 deterministically; |1⟩ measures 1", () => {
    for (let s = 0; s < 20; s++) {
      expect(runClifford(1, [meas(0, 0)], mulberry32(s + 1), 1).classical[0]).toBe(0);
      expect(runClifford(1, [gate("x", [0]), meas(0, 0)], mulberry32(s + 1), 1).classical[0]).toBe(1);
    }
  });
  test("|+⟩ measures 0/1 at random (~50/50)", () => {
    let ones = 0;
    const N = 2000;
    for (let s = 0; s < N; s++) ones += runClifford(1, [gate("h", [0]), meas(0, 0)], mulberry32(s * 2654435761 >>> 0), 1).classical[0];
    expect(ones / N).toBeGreaterThan(0.45);
    expect(ones / N).toBeLessThan(0.55);
  });
});

// ── X- and Y-basis measurement ──────────────────────────────────────────
describe("measure_x / measure_y", () => {
  const mx = (q: number, c: number): PlacedGate => ({ ...gate("measure_x", [q]), clbits: [c] });
  const my = (q: number, c: number): PlacedGate => ({ ...gate("measure_y", [q]), clbits: [c] });

  test("measure_x is deterministic on the X eigenstate |+⟩, random on |0⟩", () => {
    for (let s = 0; s < 30; s++) {
      expect(runClifford(1, [gate("h", [0]), mx(0, 0)], mulberry32(s + 1), 1).classical[0]).toBe(0);
    }
    let ones = 0;
    for (let s = 0; s < 800; s++) ones += runClifford(1, [mx(0, 0)], mulberry32(s * 40503 + 7), 1).classical[0];
    expect(ones / 800).toBeGreaterThan(0.4);
    expect(ones / 800).toBeLessThan(0.6);
  });

  test("measure_y is deterministic on the Y eigenstate |+i⟩ = S·H·|0⟩", () => {
    for (let s = 0; s < 30; s++) {
      expect(runClifford(1, [gate("h", [0]), gate("s", [0]), my(0, 0)], mulberry32(s + 1), 1).classical[0]).toBe(0);
    }
  });
});

// ── reset ───────────────────────────────────────────────────────────────
describe("reset", () => {
  test("reset returns |1⟩ and |+⟩ to |0⟩", () => {
    for (let s = 0; s < 20; s++) {
      expect(runClifford(1, [gate("x", [0]), gate("reset", [0]), meas(0, 0)], mulberry32(s + 1), 1).classical[0]).toBe(0);
      expect(runClifford(1, [gate("h", [0]), gate("reset", [0]), meas(0, 0)], mulberry32(s + 99), 1).classical[0]).toBe(0);
    }
  });
});

// ── Anti-controls and classical conditions ──────────────────────────────
describe("anti-controls and conditional gates", () => {
  test("anti-controlled CX fires on a |0⟩ control, not a |1⟩ control", () => {
    const antiCX: PlacedGate = { ...gate("cx", [1], [0]), controlStates: [false] };
    for (let s = 0; s < 20; s++) {
      // |00⟩: control is |0⟩ ⇒ fires ⇒ target → 1
      expect([...runClifford(2, [antiCX, meas(0, 0), meas(1, 1)], mulberry32(s + 1), 2).classical]).toEqual([0, 1]);
      // |10⟩: control is |1⟩ ⇒ does not fire ⇒ target stays 0
      expect([...runClifford(2, [gate("x", [0]), antiCX, meas(0, 0), meas(1, 1)], mulberry32(s + 1), 2).classical]).toEqual([1, 0]);
    }
  });

  test("classical condition: X(q1) if c0==1 correlates the two outcomes", () => {
    const condX: PlacedGate = { ...gate("x", [1]), condition: { clbit: 0, value: 1 } };
    const gates = [gate("h", [0]), meas(0, 0), condX, meas(1, 1)];
    for (let s = 0; s < 40; s++) {
      const { classical } = runClifford(2, gates, mulberry32(s + 1), 2);
      expect(classical[1]).toBe(classical[0]);
    }
  });
});

// ── Noisy Clifford via Pauli-frame tracking ─────────────────────────────
describe("noisy Clifford (Pauli frame)", () => {
  test("zero-rate noise reproduces the noiseless deterministic outcome", () => {
    const gates = [gate("x", [0]), meas(0, 0)];
    for (let s = 0; s < 20; s++) {
      expect(runCliffordNoisy(1, gates, mulberry32(s + 1), 1, { oneQubitDepolarising: 0, twoQubitDepolarising: 0 }).classical[0]).toBe(1);
    }
  });

  test("depolarising flips a deterministic outcome with positive probability", () => {
    const gates = [gate("x", [0]), meas(0, 0)]; // noiseless ⇒ always 1
    const hist = sampleSyndromes(1, gates, 1, 4000, { oneQubitDepolarising: 0.2, twoQubitDepolarising: 0 });
    const ones = hist.get("1") ?? 0, zeros = hist.get("0") ?? 0;
    expect(ones + zeros).toBe(4000);
    expect(zeros).toBeGreaterThan(0);    // noise caused some flips
    expect(ones).toBeGreaterThan(zeros); // but it's still mostly 1
  });

  test("syndrome sampling sums to shots on a 50-qubit GHZ under noise", () => {
    const g = (id: string, t: number[], c: number[] = [], cl: number[] = []): PlacedGate =>
      ({ ...gate(id, t, c), clbits: cl });
    const gates = [g("h", [0])];
    for (let q = 1; q < 50; q++) gates.push(g("cx", [q], [q - 1]));
    for (let q = 0; q < 50; q++) gates.push(g("measure", [q], [], [q]));
    const hist = sampleSyndromes(50, gates, 50, 300, { oneQubitDepolarising: 0.01, twoQubitDepolarising: 0.02 });
    expect([...hist.values()].reduce((a, b) => a + b, 0)).toBe(300);
  });

  test("noisy measurement in the X and Y bases propagates the frame through the basis change", () => {
    const mx = (qb: number, c: number): PlacedGate => ({ ...gate("measure_x", [qb]), clbits: [c] });
    const my = (qb: number, c: number): PlacedGate => ({ ...gate("measure_y", [qb]), clbits: [c] });
    const nz = { oneQubitDepolarising: 0.1, twoQubitDepolarising: 0 };
    const hx = sampleSyndromes(1, [gate("h", [0]), mx(0, 0)], 1, 1000, nz);
    const hy = sampleSyndromes(1, [gate("h", [0]), gate("s", [0]), my(0, 0)], 1, 1000, nz);
    expect([...hx.values()].reduce((a, b) => a + b, 0)).toBe(1000);
    expect([...hy.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

// ── Large-n routing through simulate() ──────────────────────────────────
describe("simulate routes large Clifford circuits to the tableau", () => {
  test("20-qubit GHZ uses the stabilizer path with correct Pauli correlations", () => {
    const gates = [gate("h", [0])];
    for (let q = 1; q < 20; q++) gates.push(gate("cx", [q], [q - 1]));
    const r = simulate(circ(20, gates), {});
    expect(r.isStabilizer).toBe(true);
    const zz = ["Z", "Z", ...Array(18).fill("I")] as ("I" | "X" | "Y" | "Z")[];
    const z0 = ["Z", ...Array(19).fill("I")] as ("I" | "X" | "Y" | "Z")[];
    expect(r.pauliExpectation?.(zz)).toBe(1); // ⟨Z_iZ_j⟩ = +1 on GHZ
    expect(r.pauliExpectation?.(z0)).toBe(0); // ⟨Z_i⟩ = 0 on GHZ
  });
});

describe("isCliffordOnly", () => {
  test("rejects non-Clifford gates but allows measure/reset/barrier", () => {
    expect(isCliffordOnly([{ gateId: "h" }, { gateId: "cx" }, { gateId: "measure" }, { gateId: "reset" }, { gateId: "barrier" }])).toBe(true);
    expect(isCliffordOnly([{ gateId: "rz" }])).toBe(false);
    expect(isCliffordOnly([{ gateId: "ccx" }])).toBe(false); // Toffoli is not Clifford
  });
});
