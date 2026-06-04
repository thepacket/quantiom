import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";

/** Probability of basis label (big-endian string) in a sim result. */
function probOf(res: ReturnType<typeof simulate>, label: string): number {
  const a = res.amplitudes.find((x) => x.basis === label);
  return a ? a.re * a.re + a.im * a.im : 0;
}
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("statevector simulator — canonical states", () => {
  test("empty 1-qubit circuit is |0⟩", () => {
    const r = simulate(circ(1, []), {});
    expect(close(probOf(r, "0"), 1)).toBe(true);
  });

  test("X flips |0⟩ → |1⟩", () => {
    const r = simulate(circ(1, [gate("x", [0])]), {});
    expect(close(probOf(r, "1"), 1)).toBe(true);
  });

  test("H makes a uniform superposition", () => {
    const r = simulate(circ(1, [gate("h", [0])]), {});
    expect(close(probOf(r, "0"), 0.5)).toBe(true);
    expect(close(probOf(r, "1"), 0.5)).toBe(true);
  });

  test("H·H = I", () => {
    const r = simulate(circ(1, [gate("h", [0], [], [], 0), gate("h", [0], [], [], 1)]), {});
    expect(close(probOf(r, "0"), 1)).toBe(true);
  });

  test("Bell state: H(0)·CX(0→1) = (|00⟩+|11⟩)/√2", () => {
    const r = simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {});
    expect(close(probOf(r, "00"), 0.5)).toBe(true);
    expect(close(probOf(r, "11"), 0.5)).toBe(true);
    expect(close(probOf(r, "01"), 0)).toBe(true);
    expect(close(probOf(r, "10"), 0)).toBe(true);
  });

  test("3-qubit GHZ", () => {
    const r = simulate(circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]), {});
    expect(close(probOf(r, "000"), 0.5)).toBe(true);
    expect(close(probOf(r, "111"), 0.5)).toBe(true);
  });

  test("big-endian: X on qubit 0 gives |100⟩", () => {
    const r = simulate(circ(3, [gate("x", [0])]), {});
    expect(close(probOf(r, "100"), 1)).toBe(true);
  });

  test("big-endian: X on qubit 2 gives |001⟩", () => {
    const r = simulate(circ(3, [gate("x", [2])]), {});
    expect(close(probOf(r, "001"), 1)).toBe(true);
  });
});

describe("rotations & parameters", () => {
  test("RX(π) ≈ X up to phase: |0⟩ → |1⟩", () => {
    const r = simulate(circ(1, [gate("rx", [0], [], ["pi"])]), {});
    expect(close(probOf(r, "1"), 1)).toBe(true);
  });

  test("RY(π/2) on |0⟩ gives equal split", () => {
    const r = simulate(circ(1, [gate("ry", [0], [], ["pi/2"])]), {});
    expect(close(probOf(r, "0"), 0.5)).toBe(true);
    expect(close(probOf(r, "1"), 0.5)).toBe(true);
  });

  test("free symbol drives the angle via paramValues", () => {
    const c = circ(1, [gate("rx", [0], [], ["theta"])]);
    expect(simulate(c, { theta: 0 }).amplitudes[0].re).toBeCloseTo(1, 9);
    const half = simulate(c, { theta: Math.PI });
    expect(close(probOf(half, "1"), 1)).toBe(true);
  });

  test("freeSymbols are reported", () => {
    const r = simulate(circ(1, [gate("rz", [0], [], ["phi"])]), { phi: 0 });
    expect(r.freeSymbols).toContain("phi");
  });
});

describe("probabilities & normalization", () => {
  test("probabilities sum to 1 across a non-trivial circuit", () => {
    const r = simulate(circ(3, [
      gate("h", [0]), gate("ry", [1], [], ["0.7"]), gate("cx", [2], [0]), gate("t", [1]),
    ]), {});
    const sum = r.probabilities.reduce((a, b) => a + b, 0);
    expect(close(sum, 1, 1e-9)).toBe(true);
  });

  test("Bloch vector of |0⟩ points +Z", () => {
    const r = simulate(circ(1, []), {});
    expect(close(r.blochVectors[0].x, 0)).toBe(true);
    expect(close(r.blochVectors[0].y, 0)).toBe(true);
    expect(close(r.blochVectors[0].z, 1)).toBe(true);
  });

  test("Bloch vector of |+⟩ points +X", () => {
    const r = simulate(circ(1, [gate("h", [0])]), {});
    expect(close(r.blochVectors[0].x, 1)).toBe(true);
    expect(close(r.blochVectors[0].z, 0)).toBe(true);
  });
});

describe("state preparation & measurement", () => {
  test("init1 prepares |1⟩", () => {
    const r = simulate(circ(1, [gate("init1", [0])]), {});
    expect(close(probOf(r, "1"), 1)).toBe(true);
  });

  test("initplus prepares |+⟩", () => {
    const r = simulate(circ(1, [gate("initplus", [0])]), {});
    expect(close(probOf(r, "0"), 0.5)).toBe(true);
    expect(close(probOf(r, "1"), 0.5)).toBe(true);
  });

  test("measurement collapses and records to a classical bit (seeded, deterministic)", () => {
    const c = circ(1, [gate("h", [0]), { ...gate("measure", [0]), clbits: [0] }], 1);
    const r = simulate(c, {});
    // After measurement the state is a basis state (prob 0 or 1 on |0⟩).
    const p0 = probOf(r, "0");
    expect(close(p0, 0) || close(p0, 1)).toBe(true);
    expect(r.measurementRecord).toBeDefined();
  });
});

describe("guards", () => {
  test("rejects zero qubits", () => {
    expect(() => simulate({ numQubits: 0, numClbits: 0, gates: [] }, {})).toThrow();
  });
});
