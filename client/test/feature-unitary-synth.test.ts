import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import { synthesizeUnitary, type Cx } from "../src/sim/unitarySynth";
import { simulate } from "../src/sim/simulate";
import { mulberry32 } from "../src/sim/measure";
import type { Circuit } from "../src/editor/types";

/** Build the dim×dim complex unitary of a circuit, column by column. */
function unitaryOf(c: Circuit, n: number): Cx[][] {
  const dim = 1 << n;
  const U: Cx[][] = Array.from({ length: dim }, () => Array.from({ length: dim }, () => ({ re: 0, im: 0 })));
  for (let j = 0; j < dim; j++) {
    const st = simulate(c, {}, [], { startIndex: j }).state;
    for (let i = 0; i < dim; i++) U[i][j] = { re: st[2 * i], im: st[2 * i + 1] };
  }
  return U;
}

/** Process fidelity |Tr(U† V)/dim|² between two unitaries (= 1 up to phase). */
function procFidelity(U: Cx[][], V: Cx[][]): number {
  const dim = U.length;
  let re = 0, im = 0;
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      // Tr(U† V) = Σ conj(U[i][j]) V[i][j]
      re += U[i][j].re * V[i][j].re + U[i][j].im * V[i][j].im;
      im += U[i][j].re * V[i][j].im - U[i][j].im * V[i][j].re;
    }
  return (re * re + im * im) / (dim * dim);
}

/** Synthesize U, rebuild, return process fidelity. */
function roundTrip(U: Cx[][], n: number): number {
  const gates = synthesizeUnitary(U, n);
  if (!gates) throw new Error("synthesis null");
  const V = unitaryOf({ numQubits: n, numClbits: 0, gates }, n);
  return procFidelity(U, V);
}

describe("arbitrary-unitary synthesis (two-level / Givens)", () => {
  it("synthesizes named circuits at fidelity 1", () => {
    expect(roundTrip(unitaryOf(circ(1, [gate("h", [0])]), 1), 1)).toBeCloseTo(1, 9);
    expect(roundTrip(unitaryOf(circ(1, [gate("t", [0])]), 1), 1)).toBeCloseTo(1, 9);
    expect(roundTrip(unitaryOf(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), 2), 2)).toBeCloseTo(1, 9);
    expect(roundTrip(unitaryOf(circ(2, [gate("cx", [1], [0]), gate("h", [1]), gate("t", [0])]), 2), 2)).toBeCloseTo(1, 9);
    expect(roundTrip(unitaryOf(circ(3, [gate("h", [0]), gate("ccx", [2], [0, 1])]), 3), 3)).toBeCloseTo(1, 9);
  });

  it("synthesizes Haar-ish random unitaries (1–3 qubits) at fidelity ≈ 1", () => {
    const rng = mulberry32(0xc0ffee);
    // Build a pseudo-random unitary from a deep random circuit.
    const randomCircuit = (n: number): Circuit => {
      const gates = [];
      for (let layer = 0; layer < 12; layer++) {
        for (let q = 0; q < n; q++) gates.push(gate(["rx", "ry", "rz"][Math.floor(rng() * 3)], [q], [], [String(rng() * 6.283)]));
        for (let q = 0; q + 1 < n; q++) if (rng() > 0.4) gates.push(gate("cx", [q + 1], [q]));
      }
      return circ(n, gates);
    };
    for (const n of [1, 2, 3]) {
      expect(roundTrip(unitaryOf(randomCircuit(n), n), n)).toBeGreaterThan(1 - 1e-7);
    }
  });

  it("rejects out-of-range sizes", () => {
    expect(synthesizeUnitary([[{ re: 1, im: 0 }]], 5)).toBeNull();
  });
});
