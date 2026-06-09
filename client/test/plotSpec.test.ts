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

describe("plotSpec — added batch: per-qubit entropy, matrices, scalars", () => {
  const bell = () => circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

  it("single-qubit entanglement entropy of a Bell pair is 1 bit on each qubit", () => {
    const d = data(computePlot(spec("qubitEntropy"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(1, 8);
    expect(d.values[1]).toBeCloseTo(1, 8);
    expect(d.signed).toBe(false); // entropy ≥ 0 → sequential scale
  });

  it("log-negativity of a Bell pair is 1 ebit off-diagonal", () => {
    const d = data(computePlot(spec("negativity"), bell(), {}, []));
    if (d.kind !== "matrix") throw new Error("shape");
    expect(d.z[0][1]).toBeCloseTo(1, 8);
    expect(d.signed).toBe(false);
  });

  it("concurrence of a Bell pair is 1 off-diagonal", () => {
    const d = data(computePlot(spec("concurrence"), bell(), {}, []));
    if (d.kind !== "matrix") throw new Error("shape");
    expect(d.z[0][1]).toBeCloseTo(1, 8);
  });

  it("mid-cut entropy is a single-value series for a Bell pair (= 1 bit)", () => {
    const d = data(computePlot(spec("midEntropy"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values.length).toBe(1);
    expect(d.values[0]).toBeCloseTo(1, 8);
  });

  it("mid-cut entropy swept over depth is a single-series line", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
    const d = data(computePlot(spec("midEntropy", "column", "line"), c, {}, []));
    if (d.kind !== "multiline") throw new Error("shape");
    expect(d.series.length).toBe(1);
    // entropy rises from 0 (after H) to 1 (after CX)
    expect(d.series[0].values[0]).toBeCloseTo(0, 8);
    expect(d.series[0].values[1]).toBeCloseTo(1, 8);
  });

  it("magic M₂ is 0 for a Clifford (Bell) state and > 0 for a T-injected state", () => {
    const clifford = data(computePlot(spec("magic"), bell(), {}, []));
    if (clifford.kind !== "series1d") throw new Error("shape");
    expect(clifford.values[0]).toBeCloseTo(0, 6);

    const tstate = circ(1, [gate("h", [0]), gate("t", [0])]);
    const m = data(computePlot(spec("magic"), tstate, {}, []));
    if (m.kind !== "series1d") throw new Error("shape");
    expect(m.values[0]).toBeGreaterThan(0.01);
  });

  it("validates scalar + swept + heatmap → must be a line", () => {
    expect(validatePlotSpec({ quantity: "magic", sweep: "column", chart: "heatmap" })).toMatch(/line/);
  });

  it("coerces scalar specs: none→bars, swept-heatmap→line", () => {
    expect(coercePlotSpec({ quantity: "magic" })?.chart).toBe("bars");
    expect(coercePlotSpec({ quantity: "midEntropy", sweep: "t", chart: "heatmap" })?.chart).toBe("line");
  });

  it("allows a sweep on qubitEntropy (per-qubit) but not on a matrix quantity", () => {
    expect(validatePlotSpec({ quantity: "qubitEntropy", sweep: "column", chart: "line" })).toBeNull();
    expect(validatePlotSpec({ quantity: "negativity", sweep: "t", chart: "heatmap" })).toMatch(/sweep/);
  });
});

describe("plotSpec — long list: per-qubit purity/coherence, phase, profiles, corr, scalars", () => {
  const bell = () => circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

  it("single-qubit purity: Bell = 1/2 each, product |0⟩ = 1", () => {
    const d = data(computePlot(spec("purityQubit"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(0.5, 8);
    expect(d.values[1]).toBeCloseTo(0.5, 8);
    const prod = data(computePlot(spec("purityQubit"), circ(1, []), {}, []));
    if (prod.kind !== "series1d") throw new Error("shape");
    expect(prod.values[0]).toBeCloseTo(1, 10);
  });

  it("single-qubit l₁ coherence of |+⟩ is 1", () => {
    const d = data(computePlot(spec("coherenceQubit"), circ(1, [gate("h", [0])]), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(1, 8);
  });

  it("amplitude phase: H·S on q0 puts +π/2 on basis |1⟩", () => {
    const d = data(computePlot(spec("phase"), circ(1, [gate("h", [0]), gate("s", [0])]), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(d.signed).toBe(true);
  });

  it("2-Rényi entropy of a Bell pair is 1 bit at the cut", () => {
    const d = data(computePlot(spec("renyi2"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(1, 8);
  });

  it("Pauli-weight distribution sums to 1 with weight-0 = 2⁻ⁿ", () => {
    const d = data(computePlot(spec("pauliWeight"), bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values.length).toBe(3); // weights 0,1,2
    expect(d.values.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
    expect(d.values[0]).toBeCloseTo(0.25, 8);
  });

  it("connected ⟨XᵢXⱼ⟩ = +1 and ⟨YᵢYⱼ⟩ = −1 off-diagonal for a Bell pair", () => {
    const xx = data(computePlot(spec("xxCorr"), bell(), {}, []));
    const yy = data(computePlot(spec("yyCorr"), bell(), {}, []));
    if (xx.kind !== "matrix" || yy.kind !== "matrix") throw new Error("shape");
    expect(xx.z[0][1]).toBeCloseTo(1, 8);
    expect(yy.z[0][1]).toBeCloseTo(-1, 8);
    expect(xx.signed).toBe(true);
  });

  it("Meyer–Wallach Q: Bell = 1, product = 0", () => {
    const b = data(computePlot(spec("meyerWallach"), bell(), {}, []));
    if (b.kind !== "series1d") throw new Error("shape");
    expect(b.values[0]).toBeCloseTo(1, 8);
    const p = data(computePlot(spec("meyerWallach"), circ(2, [gate("x", [0])]), {}, []));
    if (p.kind !== "series1d") throw new Error("shape");
    expect(p.values[0]).toBeCloseTo(0, 8);
  });

  it("participation entropy: Bell = 1 bit, |0…0⟩ = 0", () => {
    const b = data(computePlot(spec("participationEntropy"), bell(), {}, []));
    if (b.kind !== "series1d") throw new Error("shape");
    expect(b.values[0]).toBeCloseTo(1, 8);
    const z = data(computePlot(spec("participationEntropy"), circ(2, []), {}, []));
    if (z.kind !== "series1d") throw new Error("shape");
    expect(z.values[0]).toBeCloseTo(0, 10);
  });

  it("global l₁ coherence of |+⟩ is 1", () => {
    const d = data(computePlot(spec("l1Coherence"), circ(1, [gate("h", [0])]), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(1, 8);
  });

  it("purity/coherence are sweepable; Pauli-weight and phase are not", () => {
    expect(validatePlotSpec({ quantity: "purityQubit", sweep: "column", chart: "line" })).toBeNull();
    expect(validatePlotSpec({ quantity: "meyerWallach", sweep: "t", chart: "line" })).toBeNull();
    expect(validatePlotSpec({ quantity: "pauliWeight", sweep: "column", chart: "line" })).toMatch(/sweep/);
    expect(validatePlotSpec({ quantity: "phase", sweep: "t", chart: "line" })).toMatch(/sweep/);
  });
});

describe("plotSpec — parameterized quantities (args)", () => {
  const bell = () => circ(2, [gate("h", [0]), gate("cx", [1], [0])]);

  it("custom Pauli ⟨ZZ⟩ = 1 and ⟨ZI⟩ = 0 on a Bell pair", () => {
    const zz = data(computePlot({ quantity: "pauli", sweep: "none", chart: "bars", args: { pauli: "ZZ" } }, bell(), {}, []));
    if (zz.kind !== "series1d") throw new Error("shape");
    expect(zz.values[0]).toBeCloseTo(1, 8);
    const zi = data(computePlot({ quantity: "pauli", sweep: "none", chart: "bars", args: { pauli: "ZI" } }, bell(), {}, []));
    if (zi.kind !== "series1d") throw new Error("shape");
    expect(zi.values[0]).toBeCloseTo(0, 8);
  });

  it("energy ⟨H⟩ for a Pauli sum: ⟨ZZ + XX⟩ = 2 on a Bell pair", () => {
    const d = data(computePlot({ quantity: "energy", sweep: "none", chart: "bars", args: { hamiltonian: "ZZ + XX" } }, bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values[0]).toBeCloseTo(2, 8);
  });

  it("entanglement spectrum at the Bell cut is {0.5, 0.5}", () => {
    const d = data(computePlot({ quantity: "schmidt", sweep: "none", chart: "bars", args: { cut: 1 } }, bell(), {}, []));
    if (d.kind !== "series1d") throw new Error("shape");
    expect(d.values.length).toBe(2);
    expect(d.values[0]).toBeCloseTo(0.5, 8);
    expect(d.values[1]).toBeCloseTo(0.5, 8);
  });

  it("OTOC yields a C(t) series over one t period", () => {
    const c = circ(2, [gate("h", [0]), gate("rx", [1], [], ["t"])]);
    const d = data(computePlot({ quantity: "otoc", sweep: "none", chart: "line", args: { wPauli: "Z", wQubit: 0, vPauli: "Z", vQubit: 1 } }, c, { t: 0 }, []));
    if (d.kind !== "multiline") throw new Error("shape");
    expect(d.series.length).toBe(1);
    expect(d.series[0].label).toBe("C(t)");
    expect(d.xValues.length).toBeGreaterThan(8);
    expect(d.series[0].values.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("a custom Pauli observable is sweepable over depth", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
    const d = data(computePlot({ quantity: "pauli", sweep: "column", chart: "line", args: { pauli: "ZZ" } }, c, {}, []));
    if (d.kind !== "multiline") throw new Error("shape");
    expect(d.series.length).toBe(1);
    expect(d.series[0].values[d.series[0].values.length - 1]).toBeCloseTo(1, 8);
  });

  it("validates missing args and the otoc line-chart rule", () => {
    expect(validatePlotSpec({ quantity: "pauli", sweep: "none", chart: "bars" })).toMatch(/Pauli string/);
    expect(validatePlotSpec({ quantity: "energy", sweep: "none", chart: "bars" })).toMatch(/Hamiltonian/);
    expect(validatePlotSpec({ quantity: "schmidt", sweep: "none", chart: "bars" })).toMatch(/cut/);
    expect(validatePlotSpec({ quantity: "otoc", sweep: "none", chart: "heatmap", args: {} })).toMatch(/line/);
  });

  it("coerces and preserves args; otoc forces a line chart", () => {
    const p = coercePlotSpec({ quantity: "pauli", args: { pauli: "xz" } });
    expect(p?.args?.pauli).toBe("XZ");
    const o = coercePlotSpec({ quantity: "otoc", chart: "bars", args: { wQubit: 0, vQubit: 1 } });
    expect(o?.chart).toBe("line");
    expect(o?.args?.vQubit).toBe(1);
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
