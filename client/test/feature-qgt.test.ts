import { describe, test, expect } from "vitest";
import { quantumGeometricTensor } from "../src/sim/qgt";
import { circ, gate } from "./helpers";

describe("quantumGeometricTensor", () => {
  test("single RY(θ): Fubini–Study metric g_θθ = 1/4", () => {
    // |ψ(θ)⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩ ⇒ g = 1/4 for all θ.
    const c = circ(1, [gate("ry", [0], [], ["theta"], 0)]);
    const r = quantumGeometricTensor(c, [], { theta: 0.7 }, ["theta"])!;
    expect(r.metric[0][0]).toBeCloseTo(0.25, 5);
    expect(r.berry[0][0]).toBeCloseTo(0, 6);
    expect(r.metricEigenvalues[0]).toBeCloseTo(0.25, 5);
    expect(r.metricDet).toBeCloseTo(0.25, 5);
  });

  test("RY metric is θ-independent (constant 1/4)", () => {
    const c = circ(1, [gate("ry", [0], [], ["a"], 0)]);
    for (const a of [0.0, 0.5, 1.3, 2.5]) {
      const r = quantumGeometricTensor(c, [], { a }, ["a"])!;
      expect(r.metric[0][0]).toBeCloseTo(0.25, 4);
    }
  });

  test("two independent RY on separate qubits give a diagonal metric ¼·I", () => {
    const c = circ(2, [gate("ry", [0], [], ["a"], 0), gate("ry", [1], [], ["b"], 0)]);
    const r = quantumGeometricTensor(c, [], { a: 0.6, b: 1.1 }, ["a", "b"])!;
    expect(r.metric[0][0]).toBeCloseTo(0.25, 4);
    expect(r.metric[1][1]).toBeCloseTo(0.25, 4);
    expect(r.metric[0][1]).toBeCloseTo(0, 4); // independent ⇒ no cross term
    expect(r.metric[1][0]).toBeCloseTo(0, 4);
    expect(r.metricDet).toBeCloseTo(0.0625, 4); // (1/4)²
  });

  test("single RZ on |0⟩ has a degenerate (zero) metric — phase-only on an eigenstate", () => {
    // RZ(φ)|0⟩ = e^{−iφ/2}|0⟩: pure global phase ⇒ ∂φ ψ ∝ ψ ⇒ Q = 0.
    const c = circ(1, [gate("rz", [0], [], ["phi"], 0)]);
    const r = quantumGeometricTensor(c, [], { phi: 0.4 }, ["phi"])!;
    expect(r.metric[0][0]).toBeCloseTo(0, 5);
  });

  test("RZ after H is sensitive: g_φφ = 1/4 (equatorial rotation)", () => {
    // H then RZ(φ): state sweeps the equator ⇒ g = 1/4.
    const c = circ(1, [gate("h", [0], [], [], 0), gate("rz", [0], [], ["phi"], 1)]);
    const r = quantumGeometricTensor(c, [], { phi: 0.9 }, ["phi"])!;
    expect(r.metric[0][0]).toBeCloseTo(0.25, 4);
  });

  test("metric is symmetric and PSD (non-negative eigenvalues)", () => {
    const c = circ(2, [
      gate("ry", [0], [], ["a"], 0),
      gate("cx", [1], [0], [], 1),
      gate("ry", [1], [], ["b"], 2),
    ]);
    const r = quantumGeometricTensor(c, [], { a: 0.5, b: 0.8 }, ["a", "b"])!;
    expect(r.metric[0][1]).toBeCloseTo(r.metric[1][0], 6);
    for (const e of r.metricEigenvalues) expect(e).toBeGreaterThan(-1e-6);
  });

  test("returns null with no symbols or past caps", () => {
    const c = circ(1, [gate("h", [0])]);
    expect(quantumGeometricTensor(c, [], {}, [])).toBeNull();
    expect(quantumGeometricTensor(c, [], { a: 0 }, ["a", "b", "c", "d", "e", "f", "g", "h", "i"])).toBeNull();
  });
});
