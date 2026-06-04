import { describe, test, expect } from "vitest";
import { sampleMeasurementShots, sampleAveragedAmplitudeProbabilities } from "../src/sim/measurementShots";
import { circ, gate } from "./helpers";
import type { PlacedGate } from "../src/editor/types";

const meas = (q: number, c: number): PlacedGate => ({ ...gate("measure", [q]), clbits: [c] });

describe("sampleMeasurementShots", () => {
  test("Bell measured on both qubits yields only 00 and 11, ~50/50", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0]), meas(0, 0), meas(1, 1)], 2);
    const hist = sampleMeasurementShots(c, {}, [], 4000);
    expect([...hist.keys()].sort()).toEqual(["00", "11"]);
    const c00 = hist.get("00") ?? 0;
    expect(c00 / 4000).toBeGreaterThan(0.4);
    expect(c00 / 4000).toBeLessThan(0.6);
    expect([...hist.values()].reduce((a, b) => a + b, 0)).toBe(4000);
  });

  test("a circuit with no measurement returns an empty histogram", () => {
    expect(sampleMeasurementShots(circ(1, [gate("h", [0])]), {}, [], 100).size).toBe(0);
  });

  test("a deterministic measurement always reports the same outcome", () => {
    const c = circ(1, [gate("x", [0]), meas(0, 0)], 1);
    const hist = sampleMeasurementShots(c, {}, [], 500);
    expect([...hist.keys()]).toEqual(["1"]);
    expect(hist.get("1")).toBe(500);
  });
});

describe("sampleAveragedAmplitudeProbabilities", () => {
  test("mid-circuit measurement: averaged probabilities reflect both branches", () => {
    const c = circ(1, [gate("h", [0]), meas(0, 0)], 1);
    const p = sampleAveragedAmplitudeProbabilities(c, {}, [], 4000);
    expect(p.length).toBe(2);
    expect(Math.abs(p[0] - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(p[1] - 0.5)).toBeLessThan(0.05);
  });

  test("no-measurement circuit equals the exact probabilities", () => {
    const p = sampleAveragedAmplitudeProbabilities(circ(1, [gate("h", [0])]), {}, [], 16);
    expect(Math.abs(p[0] - 0.5)).toBeLessThan(1e-9);
    expect(Math.abs(p[1] - 0.5)).toBeLessThan(1e-9);
  });
});
