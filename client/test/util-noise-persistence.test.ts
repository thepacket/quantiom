import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { loadNoise, saveNoise, importIbmBackend, DEFAULT_NOISE } from "../src/sim/noise";

const KEY = "quantiom:noise:v2";

describe("loadNoise / saveNoise", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("empty storage returns the defaults", () => {
    expect(loadNoise()).toEqual(DEFAULT_NOISE);
  });

  test("clamps out-of-range rates and the trajectory count on load", () => {
    store[KEY] = JSON.stringify({
      oneQubitDepolarising: 5, amplitudeDamping: -1, trajectories: 999999,
    });
    const n = loadNoise();
    expect(n.oneQubitDepolarising).toBe(1); // clamped to [0,1]
    expect(n.amplitudeDamping).toBe(0);
    expect(n.trajectories).toBe(8192); // clamped to [1, 8192]
  });

  test("sanitises perQubit entries and filters perGate to finite [0,1]", () => {
    store[KEY] = JSON.stringify({
      perQubit: [{ oneQubitDepolarising: 2, phaseDamping: 0.01, bogus: "x" }, "garbage"],
      perGate: { sx: 0.001, cx: 7, bad: "nope", inf: Infinity },
    });
    const n = loadNoise();
    expect(n.perQubit![0].oneQubitDepolarising).toBe(1); // clamped
    expect(n.perQubit![0].phaseDamping).toBeCloseTo(0.01, 9);
    expect(n.perQubit![1]).toEqual({}); // non-object → {}
    expect(n.perGate).toEqual({ sx: 0.001, cx: 1 }); // bad/inf dropped, cx clamped
  });

  test("keeps only well-formed custom Kraus operators (8 / 32 floats)", () => {
    store[KEY] = JSON.stringify({
      customKraus: { enabled: true, operators: [[1, 0, 0, 0, 0, 0, 1, 0], [1, 2, 3]] },
      customKraus2q: { enabled: false, operators: [new Array(32).fill(0)] },
    });
    const n = loadNoise();
    expect(n.customKraus!.operators).toHaveLength(1); // the short op is dropped
    expect(n.customKraus!.name).toBe("custom"); // default name
    expect(n.customKraus2q!.operators).toHaveLength(1);
  });

  test("corrupted JSON falls back to the defaults", () => {
    store[KEY] = "{not valid";
    expect(loadNoise()).toEqual(DEFAULT_NOISE);
  });

  test("save round-trips through load", () => {
    const m = { ...DEFAULT_NOISE, oneQubitDepolarising: 0.07, crosstalk: 0.01 };
    saveNoise(m);
    expect(loadNoise().oneQubitDepolarising).toBeCloseTo(0.07, 9);
  });

  test("save swallows storage errors", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => { throw new Error("quota"); },
      getItem: () => null,
    };
    expect(() => saveNoise(DEFAULT_NOISE)).not.toThrow();
  });
});

describe("importIbmBackend — edge snapshots", () => {
  test("infers the coupling map from cx gates when coupling_map is absent", () => {
    const snap = JSON.stringify({
      backend_name: "edge",
      qubits: [
        [{ name: "T1", value: 100e-6 }, { name: "T2", value: 80e-6 }, { name: "readout_error", value: 0.02 }],
        [{ name: "T1", value: 120e-6 }, { name: "T2", value: 90e-6 }, { name: "readout_error", value: 0.03 }],
      ],
      gates: [
        { gate: "sx", qubits: [0], parameters: [{ name: "gate_error", value: 0.0003 }] },
        { gate: "cx", qubits: [0, 1], parameters: [{ name: "gate_error", value: 0.01 }] },
      ],
      // no coupling_map field
    });
    const m = importIbmBackend(snap);
    expect(m.coupling?.[0]).toContain(1);
    expect(m.coupling?.[1]).toContain(0);
  });

  test("missing qubit properties and gate errors default to zero, not NaN", () => {
    const snap = JSON.stringify({
      backend_name: "sparse",
      // qubit 0 has no T1/T2/readout; no sx gate entry for it either.
      qubits: [[], []],
      gates: [
        { gate: "sx", qubits: [1] }, // no parameters → paramValue undefined
        { gate: "cx", qubits: [0, 1] }, // no gate_error
      ],
    });
    const m = importIbmBackend(snap);
    const q0 = m.perQubit![0];
    expect(q0.amplitudeDamping).toBe(0); // T1 absent → 0
    expect(q0.phaseDamping).toBe(0);
    expect(q0.oneQubitDepolarising).toBeUndefined(); // findGateError no match
    expect(q0.readoutBitFlip).toBeUndefined();
    // No cx gate_error ⇒ falls back to the default 2q rate; nothing is NaN.
    expect(Number.isFinite(m.twoQubitDepolarising)).toBe(true);
  });
});
