import { describe, it, expect } from "vitest";
import { circ, gate } from "./helpers";
import {
  computePlot,
  coercePlotSpec,
  validatePlotSpec,
  defaultChart,
  plotTitle,
  type PlotSpec,
} from "../src/sim/plotSpec";

const spec = (q: PlotSpec["quantity"], sweep: PlotSpec["sweep"] = "none", chart?: PlotSpec["chart"]): PlotSpec => ({
  quantity: q,
  sweep,
  chart: chart ?? defaultChart(q, sweep),
});

function data(r: ReturnType<typeof computePlot>) {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r.data;
}

describe("plotSpec — validation", () => {
  it("accepts well-formed specs", () => {
    expect(validatePlotSpec(spec("expZ"))).toBeNull();
    expect(validatePlotSpec(spec("expX", "column", "line"))).toBeNull();
    expect(validatePlotSpec(spec("mutualInfo", "none", "heatmap"))).toBeNull();
  });

  it("rejects a sweep on a non-per-qubit quantity", () => {
    expect(validatePlotSpec({ quantity: "prob", sweep: "t", chart: "line" })).toMatch(/per-qubit/);
  });

  it("rejects a matrix quantity without a heatmap", () => {
    expect(validatePlotSpec({ quantity: "zzCorr", sweep: "none", chart: "bars" })).toMatch(/heatmap/);
  });

  it("rejects bars for a swept quantity", () => {
    expect(validatePlotSpec({ quantity: "expZ", sweep: "column", chart: "bars" })).toMatch(/2-D/);
  });
});

describe("plotSpec — coercion repairs impossible combos", () => {
  it("forces heatmap for matrix quantities", () => {
    expect(coercePlotSpec({ quantity: "mutualInfo", chart: "bars" })?.chart).toBe("heatmap");
  });
  it("drops an invalid sweep for non-per-qubit quantities", () => {
    expect(coercePlotSpec({ quantity: "prob", sweep: "t" })?.sweep).toBe("none");
  });
  it("upgrades bars→line for a swept quantity", () => {
    expect(coercePlotSpec({ quantity: "expZ", sweep: "column", chart: "bars" })?.chart).toBe("line");
  });
  it("returns null for an unknown quantity", () => {
    expect(coercePlotSpec({ quantity: "nope" })).toBeNull();
    expect(coercePlotSpec(null)).toBeNull();
  });
  it("keeps a provided title", () => {
    expect(coercePlotSpec({ quantity: "expZ", title: "My plot" })?.title).toBe("My plot");
    expect(plotTitle({ quantity: "expZ", sweep: "none", chart: "bars", title: "Custom" })).toBe("Custom");
  });
});

describe("plotSpec — per-qubit expectations", () => {
  it("⟨Z⟩ on |00⟩ is +1 for every qubit", () => {
    const c = circ(2, []);
    const d = data(computePlot(spec("expZ"), c, {}, []));
    expect(d.kind).toBe("series1d");
    if (d.kind !== "series1d") return;
    expect(d.values).toEqual([1, 1]);
    expect(d.signed).toBe(true);
  });

  it("⟨X⟩ after H on q0 is +1 on q0, 0 on q1", () => {
    const c = circ(2, [gate("h", [0])]);
    const d = data(computePlot(spec("expX"), c, {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(1, 10);
    expect(d.values[1]).toBeCloseTo(0, 10);
  });

  it("⟨Z⟩ after X on q0 is −1 on q0", () => {
    const c = circ(1, [gate("x", [0])]);
    const d = data(computePlot(spec("expZ"), c, {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(-1, 10);
  });
});

describe("plotSpec — basis distributions", () => {
  it("probabilities after H on q0 are 0.5 / 0.5", () => {
    const c = circ(1, [gate("h", [0])]);
    const d = data(computePlot(spec("prob"), c, {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(0.5, 10);
    expect(d.values[1]).toBeCloseTo(0.5, 10);
    expect(d.xLabels).toEqual(["0", "1"]);
  });

  it("|amplitude| sums of squares match probabilities", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
    const d = data(computePlot(spec("amp"), c, {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(d.values[3]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(d.values[1]).toBeCloseTo(0, 10);
  });
});

describe("plotSpec — entanglement quantities", () => {
  const bell = () => circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

  it("entropy profile of a Bell pair is 1 bit at the single cut", () => {
    const d = data(computePlot(spec("entropy"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values.length).toBe(1);
    expect(d.values[0]).toBeCloseTo(1, 8);
  });

  it("mutual information of a Bell pair is 2 bits (matrix)", () => {
    const d = data(computePlot(spec("mutualInfo"), bell(), {}, []));
    if (d.kind !== "matrix") throw new Error("shape");
    expect(d.z[0][1]).toBeCloseTo(2, 8);
    expect(d.signed).toBe(false);
  });

  it("connected ZZ of a Bell pair is +1 off-diagonal (signed)", () => {
    const d = data(computePlot(spec("zzCorr"), bell(), {}, []));
    if (d.kind !== "matrix") throw new Error("shape");
    expect(d.z[0][1]).toBeCloseTo(1, 8);
    expect(d.signed).toBe(true);
  });
});

describe("plotSpec — sweeps", () => {
  it("column sweep of ⟨Z⟩ yields a multiline with one series per qubit", () => {
    // X on q0 at column 0, X on q1 at column 1 (circ assigns one column each).
    const c = circ(2, [gate("x", [0]), gate("x", [1])]);
    const d = data(computePlot(spec("expZ", "column", "line"), c, {}, []));
    if (d.kind !== "multiline") throw new Error("shape");
    expect(d.series.length).toBe(2);
    // q0 flips to −1 after col 0; q1 flips after col 1.
    expect(d.series[0].values[0]).toBeCloseTo(-1, 8);
    expect(d.series[1].values[0]).toBeCloseTo(1, 8);
    expect(d.series[1].values[1]).toBeCloseTo(-1, 8);
  });

  it("column sweep with heatmap chart yields a matrix (qubit × step)", () => {
    const c = circ(2, [gate("x", [0]), gate("x", [1])]);
    const d = data(computePlot(spec("expZ", "column", "heatmap"), c, {}, []));
    if (d.kind !== "matrix") throw new Error("shape");
    expect(d.z.length).toBe(2); // rows = qubits
    expect(d.z[0].length).toBe(2); // cols = steps
  });

  it("t sweep of ⟨Z⟩ on an rz(t) circuit varies over the period", () => {
    const c = circ(1, [gate("h", [0]), gate("rx", [0], [], ["t"])]);
    const d = data(computePlot(spec("expZ", "t", "line"), c, { t: 0 }, []));
    if (d.kind !== "multiline") throw new Error("shape");
    expect(d.series.length).toBe(1);
    expect(d.xValues.length).toBeGreaterThan(2);
  });
});

describe("plotSpec — error paths", () => {
  it("reports the cap for too many qubits on a basis plot", () => {
    const c = circ(11, []);
    const r = computePlot(spec("prob"), c, {}, []);
    expect("error" in r && r.error).toMatch(/capped/);
  });

  it("reports needing ≥2 qubits for matrix quantities", () => {
    const c = circ(1, [gate("h", [0])]);
    const r = computePlot(spec("mutualInfo"), c, {}, []);
    expect("error" in r && r.error).toMatch(/≥ 2/);
  });
});
