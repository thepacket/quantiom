import { describe, test, expect } from "vitest";
import { simulateNoisy } from "../src/sim/simulateNoisy";
import { simulate } from "../src/sim/simulate";
import { DEFAULT_NOISE, rateFor, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless: NoiseModel = {
  ...DEFAULT_NOISE,
  enabled: true,
  trajectories: 1,
  oneQubitDepolarising: 0,
  twoQubitDepolarising: 0,
  amplitudeDamping: 0,
  phaseDamping: 0,
  readoutBitFlip: 0,
  crosstalk: 0,
};

/** Noiseless base with channel overrides applied. */
const noise = (over: Partial<NoiseModel>): NoiseModel => ({ ...noiseless, ...over });

const bell = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

describe("trajectory noise simulator", () => {
  test("zero-rate noise reproduces the ideal probabilities", () => {
    const ideal = simulate(bell, {});
    const noisy = simulateNoisy(bell, {}, [], noiseless);
    for (let i = 0; i < ideal.probabilities.length; i++) {
      expect(noisy.probabilities[i]).toBeCloseTo(ideal.probabilities[i], 9);
    }
    expect(noisy.isNoisy).toBe(true);
  });

  test("probabilities stay normalized under heavy depolarising noise", () => {
    const heavy: NoiseModel = { ...noiseless, trajectories: 200, oneQubitDepolarising: 0.2, twoQubitDepolarising: 0.3 };
    const r = simulateNoisy(bell, {}, [], heavy);
    const sum = r.probabilities.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    // Depolarising leaks weight into the |01⟩/|10⟩ subspace the ideal Bell
    // state never occupies.
    const leaked = r.probabilities[1] + r.probabilities[2];
    expect(leaked).toBeGreaterThan(0);
  });

  test("full depolarising drives a single qubit toward the maximally mixed state", () => {
    const c = circ(1, [gate("x", [0])]);
    const r = simulateNoisy(c, {}, [], { ...noiseless, trajectories: 4000, oneQubitDepolarising: 0.75 });
    // p = 3/4 depolarising fully randomizes ⇒ ≈ 50/50.
    expect(r.probabilities[0]).toBeGreaterThan(0.4);
    expect(r.probabilities[0]).toBeLessThan(0.6);
  });
});

describe("rateFor lookup", () => {
  test("falls back to the global rate with no per-qubit overrides", () => {
    const m: NoiseModel = { ...DEFAULT_NOISE, oneQubitDepolarising: 0.01 };
    expect(rateFor(m, "oneQubitDepolarising", 0)).toBeCloseTo(0.01, 12);
  });

  test("per-qubit override wins when present", () => {
    const m: NoiseModel = {
      ...DEFAULT_NOISE,
      oneQubitDepolarising: 0.01,
      perQubit: [{ oneQubitDepolarising: 0.5 }],
    };
    expect(rateFor(m, "oneQubitDepolarising", 0)).toBeCloseTo(0.5, 12);
    // Out-of-range qubit falls back to the global rate.
    expect(rateFor(m, "oneQubitDepolarising", 5)).toBeCloseTo(0.01, 12);
  });
});

// These channels are stochastic (simulateNoisy uses Math.random), so the
// trajectory counts are high and tolerances generous (~7σ+) to keep the
// tests effectively non-flaky while still pinning the analytic mean.

describe("amplitude damping (T1)", () => {
  test("one application decays excited population by (1 − γ)", () => {
    // X prepares |1⟩; the gate triggers exactly one damping application.
    const r = simulateNoisy(circ(1, [gate("x", [0])]), {}, [], noise({ trajectories: 8000, amplitudeDamping: 0.3 }));
    expect(Math.abs(r.probabilities[1] - 0.7)).toBeLessThan(0.04); // (1 − 0.3)·1
  });

  test("the ground state is untouched (no population to decay)", () => {
    // Identity gate on |0⟩ fires the channel, but p_excited = 0.
    const r = simulateNoisy(circ(1, [gate("i", [0])]), {}, [], noise({ trajectories: 2000, amplitudeDamping: 0.5 }));
    expect(r.probabilities[0]).toBeCloseTo(1, 6);
  });

  test("repeated gates compound the decay: (1 − γ)^k toward |0⟩", () => {
    // X then three identities = four damping applications: 0.7^4 ≈ 0.2401.
    const gates = [
      gate("x", [0], [], [], 0), gate("i", [0], [], [], 1),
      gate("i", [0], [], [], 2), gate("i", [0], [], [], 3),
    ];
    const r = simulateNoisy(circ(1, gates), {}, [], noise({ trajectories: 8000, amplitudeDamping: 0.3 }));
    expect(Math.abs(r.probabilities[1] - Math.pow(0.7, 4))).toBeLessThan(0.04);
  });
});

describe("phase damping (T2)", () => {
  test("shrinks coherence by √(1 − γ) but preserves populations", () => {
    // H prepares |+⟩ (⟨X⟩ = 1); the gate triggers one phase-damping application.
    const r = simulateNoisy(circ(1, [gate("h", [0])]), {}, [], noise({ trajectories: 8000, phaseDamping: 0.3 }));
    const b = r.blochVectors[0];
    expect(Math.abs(b.x - Math.sqrt(0.7))).toBeLessThan(0.05); // √(1 − γ) ≈ 0.8367
    expect(Math.abs(b.z)).toBeLessThan(0.05);                  // populations unchanged
  });
});

describe("crosstalk", () => {
  // Linear coupling 0–1–2.
  const line3: number[][] = [[1], [0, 2], [1]];

  test("a 2q gate depolarises a coupled spectator qubit", () => {
    // CX(control 0 → target 1) on |000⟩; qubit 2 (neighbour of 1, not involved)
    // gets 1q depolarising at the crosstalk rate. Depolarising rate p shrinks
    // ⟨Z⟩ by (1 − 4p/3): for p = 0.3, ⟨Z₂⟩ → 0.6.
    const c = circ(3, [gate("cx", [1], [0])]);
    const r = simulateNoisy(c, {}, [], noise({ trajectories: 8000, twoQubitDepolarising: 0, crosstalk: 0.3, coupling: line3 }));
    expect(Math.abs(r.blochVectors[2].z - 0.6)).toBeLessThan(0.05);
    // The gate qubits carry no other noise here, so they stay |0⟩.
    expect(r.blochVectors[0].z).toBeCloseTo(1, 6);
    expect(r.blochVectors[1].z).toBeCloseTo(1, 6);
  });

  test("no crosstalk without a coupling map", () => {
    const r = simulateNoisy(circ(3, [gate("cx", [1], [0])]), {}, [], noise({ trajectories: 2000, crosstalk: 0.5 }));
    expect(r.blochVectors[2].z).toBeCloseTo(1, 6);
  });
});

describe("custom Kraus channels", () => {
  test("1-qubit bit-flip Kraus flips |0⟩ with probability p", () => {
    const p = 0.25, s0 = Math.sqrt(1 - p), s1 = Math.sqrt(p);
    // 8 floats per op: [Re00,Im00, Re01,Im01, Re10,Im10, Re11,Im11]
    const K0 = [s0, 0, 0, 0, 0, 0, s0, 0]; // √(1−p)·I
    const K1 = [0, 0, s1, 0, s1, 0, 0, 0]; // √p·X
    const r = simulateNoisy(circ(1, [gate("i", [0])]), {}, [], noise({
      trajectories: 8000,
      customKraus: { enabled: true, name: "bit-flip", operators: [K0, K1] },
    }));
    expect(Math.abs(r.probabilities[1] - p)).toBeLessThan(0.04);
  });

  test("a single identity Kraus operator leaves the state unchanged", () => {
    const I = [1, 0, 0, 0, 0, 0, 1, 0];
    const r = simulateNoisy(circ(1, [gate("h", [0])]), {}, [], noise({
      trajectories: 1000,
      customKraus: { enabled: true, name: "identity", operators: [I] },
    }));
    expect(r.blochVectors[0].x).toBeCloseTo(1, 6); // still |+⟩
  });

  test("2-qubit X⊗X Kraus flips both qubits with probability p", () => {
    const p = 0.2, s0 = Math.sqrt(1 - p), s1 = Math.sqrt(p);
    // 32 floats per op: row-major 4×4, [re,im] per entry, basis (q0,q1) = 00,01,10,11.
    const I4 = [
      s0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, s0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, s0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, s0, 0,
    ];
    const XX = [ // √p·(X⊗X): 00↔11, 01↔10
      0, 0, 0, 0, 0, 0, s1, 0,
      0, 0, 0, 0, s1, 0, 0, 0,
      0, 0, s1, 0, 0, 0, 0, 0,
      s1, 0, 0, 0, 0, 0, 0, 0,
    ];
    // CX(control 0 → target 1) leaves |00⟩ unchanged (control is |0⟩); the
    // 2q channel then sends |00⟩ → |11⟩ with probability p.
    const r = simulateNoisy(circ(2, [gate("cx", [1], [0])]), {}, [], noise({
      trajectories: 8000,
      customKraus2q: { enabled: true, name: "XX", operators: [I4, XX] },
    }));
    expect(Math.abs(r.probabilities[3] - p)).toBeLessThan(0.04);       // |11⟩
    expect(Math.abs(r.probabilities[0] - (1 - p))).toBeLessThan(0.04); // |00⟩
  });
});
