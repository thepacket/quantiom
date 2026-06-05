import { describe, test, expect } from "vitest";
import { pecExpectation } from "../src/sim/pec";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless = (over: Partial<NoiseModel> = {}): NoiseModel => ({
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0, ...over,
});

// RY(π/3)|0⟩: ⟨Z⟩ = cos(π/3) = 0.5.
const ry = circ(1, [gate("ry", [0], [], ["pi/3"])]);

describe("pecExpectation", () => {
  test("zero noise → value is the ideal ⟨Z⟩, overhead 1, nothing uninverted", () => {
    const r = pecExpectation(ry, {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 200);
    expect(Math.abs(r.value - 0.5)).toBeLessThan(1e-9); // identity inverses ⇒ exact
    expect(r.varianceOverhead).toBeCloseTo(1, 6);
    expect(r.channels.oneQDepol).toBe(1); // one 1q gate location (the RY)
    expect(r.uninverted).toEqual([]);
  });

  test("evaluates symbolic parameters (π/3), not parseFloat-NaN", () => {
    const r = pecExpectation(ry, {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(Number.isNaN(r.value)).toBe(false);
  });

  test("binds free parameters from paramValues", () => {
    const c = circ(1, [gate("ry", [0], [], ["theta"])]);
    const r = pecExpectation(c, { theta: Math.PI }, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(r.value).toBeCloseTo(-1, 9); // ⟨Z⟩ of RY(π)|0⟩ = −1
  });

  test("1q depolarising inflates the overhead and PEC recovers the ideal", () => {
    const noisy = noiseless({ oneQubitDepolarising: 0.05 });
    const r = pecExpectation(ry, {}, [], noisy, { kind: "pauli", paulis: ["Z"] }, 40000);
    expect(r.channels.oneQDepol).toBe(1);
    expect(r.varianceOverhead).toBeGreaterThan(1);
    expect(Math.abs(r.value - 0.5)).toBeLessThan(0.1); // unbiased ⇒ recovers noiseless ⟨Z⟩
  });

  test("an empty circuit is handled gracefully", () => {
    const r = pecExpectation(circ(1, []), {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(Number.isFinite(r.value)).toBe(true);
  });

  test("a zero-qubit circuit short-circuits to a neutral result", () => {
    const r = pecExpectation(circ(0, []), {}, [], noiseless(), { kind: "pauli", paulis: ["Z"] }, 10);
    expect(r.value).toBe(0);
    expect(r.varianceOverhead).toBe(1);
    expect(r.channels).toEqual({ oneQDepol: 0, phaseDamping: 0, twoQDepol: 0, amplitudeDamping: 0 });
  });
});

describe("pecExpectation — two-qubit depolarising", () => {
  // Bell state: ⟨Z₀Z₁⟩ = 1 exactly. CX is the 2q location.
  const bell = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

  test("counts the 2q location, inflates overhead, recovers ⟨ZZ⟩", () => {
    const noisy = noiseless({ twoQubitDepolarising: 0.02 });
    const r = pecExpectation(bell, {}, [], noisy, { kind: "pauli", paulis: ["Z", "Z"] }, 40000);
    expect(r.channels.twoQDepol).toBe(1);
    expect(r.channels.oneQDepol).toBe(1); // the H
    expect(r.varianceOverhead).toBeGreaterThan(1);
    expect(Math.abs(r.value - 1)).toBeLessThan(0.1);
  });
});

describe("pecExpectation — phase damping", () => {
  // RY(π/3)|0⟩: ⟨X⟩ = sin(π/3) ≈ 0.8660. Phase damping shrinks ⟨X⟩; PEC recovers it.
  test("Z-only channel inverse recovers ⟨X⟩", () => {
    const noisy = noiseless({ phaseDamping: 0.1 });
    const r = pecExpectation(ry, {}, [], noisy, { kind: "pauli", paulis: ["X"] }, 40000);
    expect(r.channels.phaseDamping).toBe(1);
    expect(r.varianceOverhead).toBeGreaterThan(1);
    expect(Math.abs(r.value - Math.sin(Math.PI / 3))).toBeLessThan(0.1);
  });
});

describe("pecExpectation — amplitude damping", () => {
  // Non-Pauli inverse with the two reset channels — higher variance.
  test("runs the reset-channel path; reports the location and overhead", () => {
    const noisy = noiseless({ amplitudeDamping: 0.05 });
    const r = pecExpectation(ry, {}, [], noisy, { kind: "pauli", paulis: ["Z"] }, 60000);
    expect(r.channels.amplitudeDamping).toBe(1);
    expect(r.varianceOverhead).toBeGreaterThan(1);
    expect(Number.isFinite(r.value)).toBe(true);
    // Unbiased, but high-variance via Reset_k — keep a generous tolerance.
    expect(Math.abs(r.value - 0.5)).toBeLessThan(0.25);
  });
});

describe("pecExpectation — gate classification", () => {
  test("skips barriers, measurements, and resets (no channel locations)", () => {
    const c: Parameters<typeof pecExpectation>[0] = {
      numQubits: 1,
      numClbits: 1,
      gates: [
        gate("barrier", [0]),
        { ...gate("measure", [0]), clbits: [0] },
        gate("reset", [0]),
      ],
    };
    const r = pecExpectation(c, {}, [], noiseless({ oneQubitDepolarising: 0.05 }), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(r.channels.oneQDepol).toBe(0);
    expect(r.varianceOverhead).toBeCloseTo(1, 9);
  });

  test("handles a multi-qubit gate with an anti-control", () => {
    const ccx = { ...gate("ccx", [2], [0, 1]), controlStates: [false, true] };
    const c = circ(3, [gate("x", [1]), ccx]);
    const r = pecExpectation(c, {}, [], noiseless({ oneQubitDepolarising: 0.02 }), { kind: "pauli", paulis: ["Z"] }, 200);
    expect(Number.isFinite(r.value)).toBe(true);
    expect(r.channels.oneQDepol).toBe(1); // only the X is a 1q location; CCX is "multi"
  });

  test("handles an anti-controlled 2q gate", () => {
    const cx = { ...gate("cx", [1], [0]), controlStates: [false] };
    const c = circ(2, [cx]);
    const r = pecExpectation(c, {}, [], noiseless({ twoQubitDepolarising: 0.02 }), { kind: "pauli", paulis: ["Z"] }, 200);
    expect(Number.isFinite(r.value)).toBe(true);
    expect(r.channels.twoQDepol).toBe(1);
  });
});

describe("pecExpectation — uninverted-channel reporting", () => {
  const measured = circ(1, [gate("h", [0]), { ...gate("measure", [0]), clbits: [0] }], 1);

  test("flags readout bit-flip when a measurement is present", () => {
    const r = pecExpectation(measured, {}, [], noiseless({ readoutBitFlip: 0.02 }), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(r.uninverted).toContain("readout bit-flip");
  });

  test("flags crosstalk when a coupling map is set", () => {
    const r = pecExpectation(ry, {}, [], noiseless({ crosstalk: 0.01, coupling: [[1], [0]] }), { kind: "pauli", paulis: ["Z"] }, 50);
    expect(r.uninverted).toContain("crosstalk");
  });

  test("flags custom 1q and 2q Kraus channels", () => {
    const r = pecExpectation(
      ry, {}, [],
      noiseless({
        customKraus: { enabled: true, name: "k1", operators: [] },
        customKraus2q: { enabled: true, name: "k2", operators: [] },
      }),
      { kind: "pauli", paulis: ["Z"] }, 50,
    );
    expect(r.uninverted).toContain("custom 1q Kraus");
    expect(r.uninverted).toContain("custom 2q Kraus");
  });
});
