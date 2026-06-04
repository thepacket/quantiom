import { describe, test, expect } from "vitest";
import { importIbmBackend } from "../src/sim/noise";

// A minimal IBM `BackendProperties`-shaped snapshot: 2 qubits with
// T1/T2/readout, sx/cx gate errors and a 1q gate length, plus a coupling map.
const snapshot = JSON.stringify({
  backend_name: "fake_backend",
  last_update_date: "2026-06-04T00:00:00",
  qubits: [
    [{ name: "T1", value: 100e-6 }, { name: "T2", value: 80e-6 }, { name: "readout_error", value: 0.02 }],
    [{ name: "T1", value: 120e-6 }, { name: "T2", value: 90e-6 }, { name: "readout_error", value: 0.03 }],
  ],
  gates: [
    { gate: "sx", qubits: [0], parameters: [{ name: "gate_length", value: 35e-9 }, { name: "gate_error", value: 0.0003 }] },
    { gate: "sx", qubits: [1], parameters: [{ name: "gate_length", value: 35e-9 }, { name: "gate_error", value: 0.0005 }] },
    { gate: "cx", qubits: [0, 1], parameters: [{ name: "gate_error", value: 0.01 }] },
  ],
  coupling_map: [[0, 1]],
});

describe("importIbmBackend", () => {
  const m = importIbmBackend(snapshot);
  const gateTime = 35e-9;

  test("extracts per-qubit T1→amplitude / T2→phase damping and readout", () => {
    expect(m.perQubit?.length).toBe(2);
    const q0 = m.perQubit![0];
    expect(q0.amplitudeDamping!).toBeCloseTo(1 - Math.exp(-gateTime / 100e-6), 9);
    expect(q0.phaseDamping!).toBeCloseTo(1 - Math.exp(-gateTime / 80e-6), 9);
    expect(q0.readoutBitFlip).toBeCloseTo(0.02, 9);
    expect(q0.oneQubitDepolarising).toBeCloseTo(0.0003, 9);
  });

  test("global 2q depolarising = median cx gate_error", () => {
    expect(m.twoQubitDepolarising).toBeCloseTo(0.01, 9);
  });

  test("coupling map is symmetric", () => {
    expect(m.coupling?.[0]).toContain(1);
    expect(m.coupling?.[1]).toContain(0);
  });

  test("records the backend name in the source", () => {
    expect(m.source ?? "").toContain("fake_backend");
  });

  test("rejects JSON that isn't an IBM snapshot", () => {
    expect(() => importIbmBackend('{"foo":1}')).toThrow();
  });
});
