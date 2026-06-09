import { useEffect, useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed, setPanelCollapsed } from "./PanelShell";
import {
  computePlot,
  coercePlotSpec,
  defaultChart,
  plotTitle,
  PLOT_QUANTITIES,
  QUANTITY_LABELS,
  type PlotChart,
  type PlotData,
  type PlotQuantity,
  type PlotSpec,
  type PlotSweep,
} from "../sim/plotSpec";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const STORAGE_KEY = "quantiom:custom-plots:v1";
/** Window event other code (the AI chat) can dispatch to add a plot on demand.
 *  detail: a raw object coerced through `coercePlotSpec`. */
export const ADD_PLOT_EVENT = "quantiom:add-plot";

/** Dispatch a request to add a custom plot (used by the AI chat). Returns the
 *  coerced spec, or null if the raw value couldn't be understood. */
export function requestCustomPlot(raw: unknown): PlotSpec | null {
  const spec = coercePlotSpec(raw);
  if (!spec) return null;
  window.dispatchEvent(new CustomEvent(ADD_PLOT_EVENT, { detail: spec }));
  // Reveal the panel so the freshly-added plot is visible.
  setPanelCollapsed("custom-plots", false);
  return spec;
}

function loadSpecs(): PlotSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(coercePlotSpec).filter((s): s is PlotSpec => s !== null);
  } catch {
    return [];
  }
}

/**
 * Custom plots, built on demand from a small validated **plot spec** (see
 * `sim/plotSpec.ts`). Pick a quantity, an optional time sweep, and a chart
 * type; the panel re-simulates the circuit and draws the result with a
 * generic renderer. The AI chat can also push a spec in via the
 * `quantiom:add-plot` event — "create a new plot from a textual description"
 * with no code execution, only a constrained spec.
 *
 * Each plot recomputes only while the panel is open (default-collapsed).
 */
export function CustomPlotPanel(props: Props) {
  return (
    <PanelShell id="custom-plots" title="Custom plots" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const [specs, setSpecs] = useState<PlotSpec[]>(loadSpecs);

  // Builder draft state.
  const [quantity, setQuantity] = useState<PlotQuantity>("expZ");
  const [sweep, setSweep] = useState<PlotSweep>("none");
  const [chart, setChart] = useState<PlotChart>("bars");

  // Persist.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(specs));
    } catch {
      /* ignore */
    }
  }, [specs]);

  // Listen for AI-/external-pushed plot specs.
  useEffect(() => {
    const onAdd = (e: Event) => {
      const spec = (e as CustomEvent).detail as PlotSpec | undefined;
      if (spec && PLOT_QUANTITIES.includes(spec.quantity)) {
        setSpecs((prev) => [spec, ...prev]);
      }
    };
    window.addEventListener(ADD_PLOT_EVENT, onAdd);
    return () => window.removeEventListener(ADD_PLOT_EVENT, onAdd);
  }, []);

  // Keep the draft chart compatible when the quantity/sweep change.
  const perQubit = quantity === "expZ" || quantity === "expX" || quantity === "expY";
  const matrix = quantity === "mutualInfo" || quantity === "zzCorr";
  useEffect(() => {
    if (!perQubit && sweep !== "none") setSweep("none");
  }, [perQubit, sweep]);
  useEffect(() => {
    setChart(defaultChart(quantity, sweep));
  }, [quantity, sweep]);

  const addCurrent = () => {
    setSpecs((prev) => [{ quantity, sweep, chart }, ...prev]);
  };
  const removeAt = (i: number) => setSpecs((prev) => prev.filter((_, k) => k !== i));

  const chartChoices: PlotChart[] = matrix
    ? ["heatmap"]
    : sweep !== "none"
      ? ["line", "heatmap"]
      : ["bars", "line"];

  return (
    <div className="cplot">
      <div className="cplot__builder">
        <label className="cplot__field">
          <span>quantity</span>
          <select value={quantity} onChange={(e) => setQuantity(e.target.value as PlotQuantity)}>
            {PLOT_QUANTITIES.map((q) => (
              <option key={q} value={q}>
                {QUANTITY_LABELS[q]}
              </option>
            ))}
          </select>
        </label>
        <label className="cplot__field">
          <span>sweep</span>
          <select value={sweep} onChange={(e) => setSweep(e.target.value as PlotSweep)} disabled={!perQubit}>
            <option value="none">none</option>
            <option value="column">circuit depth</option>
            <option value="t">t clock (0…2π)</option>
          </select>
        </label>
        <label className="cplot__field">
          <span>chart</span>
          <select value={chart} onChange={(e) => setChart(e.target.value as PlotChart)}>
            {chartChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="cplot__add" onClick={addCurrent} title="Add this plot">
          + plot
        </button>
      </div>

      {specs.length === 0 ? (
        <div className="panel__placeholder">
          build a plot above, or ask the AI assistant (e.g. “plot ⟨X⟩ for each qubit vs circuit depth”)
        </div>
      ) : (
        <div className="cplot__list">
          {specs.map((spec, i) => (
            <PlotCard
              key={i}
              spec={spec}
              circuit={circuit}
              customGates={customGates}
              paramValues={paramValues}
              collapsed={collapsed}
              onRemove={() => removeAt(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlotCard({
  spec,
  circuit,
  customGates,
  paramValues,
  collapsed,
  onRemove,
}: {
  spec: PlotSpec;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  collapsed: boolean;
  onRemove: () => void;
}) {
  const result = useMemo(() => {
    if (collapsed) return null;
    return computePlot(spec, circuit, paramValues, customGates);
  }, [collapsed, spec, circuit, paramValues, customGates]);

  return (
    <div className="cplot__card">
      <div className="cplot__card-head">
        <span className="cplot__card-title">{plotTitle(spec)}</span>
        <button className="cplot__remove" onClick={onRemove} title="Remove this plot">
          ×
        </button>
      </div>
      {!result ? null : "error" in result ? (
        <div className="panel__notice">{result.error}</div>
      ) : (
        <PlotRender data={result.data} chart={spec.chart} />
      )}
    </div>
  );
}

// ─── renderer ─────────────────────────────────────────────────────────

function PlotRender({ data, chart }: { data: PlotData; chart: PlotChart }) {
  if (data.kind === "matrix") return <HeatmapPlot data={data} />;
  if (data.kind === "multiline") return <MultilinePlot data={data} />;
  return chart === "line" ? <Line1DPlot data={data} /> : <Bars1DPlot data={data} />;
}

const PLOT_W = 320;
const PLOT_H = 150;
const PAD_L = 34;
const PAD_B = 24;
const PAD_T = 8;
const PAD_R = 8;

function niceRange(values: number[], signed: boolean): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (signed) {
    const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-9);
    return [-m, m];
  }
  if (lo > 0) lo = 0;
  if (hi <= lo) hi = lo + 1e-9;
  return [lo, hi];
}

function Bars1DPlot({ data }: { data: Extract<PlotData, { kind: "series1d" }> }) {
  const [lo, hi] = niceRange(data.values, data.signed);
  const plotW = PLOT_W - PAD_L - PAD_R;
  const plotH = PLOT_H - PAD_T - PAD_B;
  const n = data.values.length;
  const bw = plotW / Math.max(1, n);
  const yOf = (v: number) => PAD_T + plotH * (1 - (v - lo) / (hi - lo));
  const zeroY = yOf(0);
  const tickEvery = Math.max(1, Math.ceil(n / 12));
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="cplot__svg plot-fill" role="img">
      <Axes lo={lo} hi={hi} xAxis={data.xAxis} yAxis={data.yAxis} />
      {data.values.map((v, i) => {
        const y = yOf(v);
        const top = Math.min(y, zeroY);
        const h = Math.abs(y - zeroY);
        return (
          <rect
            key={i}
            x={PAD_L + i * bw + bw * 0.12}
            y={top}
            width={bw * 0.76}
            height={Math.max(0.5, h)}
            fill={v >= 0 ? "var(--accent-2)" : "#ff9a5a"}
          >
            <title>{data.xLabels[i]}: {v.toFixed(4)}</title>
          </rect>
        );
      })}
      {data.xLabels.map((lab, i) =>
        i % tickEvery === 0 ? (
          <text key={i} x={PAD_L + i * bw + bw / 2} y={PLOT_H - 6} textAnchor="middle" className="cplot__tick">
            {lab.length > 6 ? lab.slice(0, 6) : lab}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Line1DPlot({ data }: { data: Extract<PlotData, { kind: "series1d" }> }) {
  const [lo, hi] = niceRange(data.values, data.signed);
  const plotW = PLOT_W - PAD_L - PAD_R;
  const plotH = PLOT_H - PAD_T - PAD_B;
  const n = data.values.length;
  const xOf = (i: number) => PAD_L + (plotW * i) / Math.max(1, n - 1);
  const yOf = (v: number) => PAD_T + plotH * (1 - (v - lo) / (hi - lo));
  const d = data.values.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const tickEvery = Math.max(1, Math.ceil(n / 12));
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="cplot__svg plot-fill" role="img">
      <Axes lo={lo} hi={hi} xAxis={data.xAxis} yAxis={data.yAxis} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.4} />
      {data.values.map((v, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r={1.6} fill="var(--accent)">
          <title>{data.xLabels[i]}: {v.toFixed(4)}</title>
        </circle>
      ))}
      {data.xLabels.map((lab, i) =>
        i % tickEvery === 0 ? (
          <text key={i} x={xOf(i)} y={PLOT_H - 6} textAnchor="middle" className="cplot__tick">
            {lab.length > 6 ? lab.slice(0, 6) : lab}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const LINE_COLORS = ["#5aa9ff", "#ff9a5a", "#7ed957", "#c77dff", "#ffd166", "#4cc9c0", "#ff6b6b", "#a0a0ff"];

function MultilinePlot({ data }: { data: Extract<PlotData, { kind: "multiline" }> }) {
  const all = data.series.flatMap((s) => s.values);
  const [lo, hi] = niceRange(all, data.signed);
  const plotW = PLOT_W - PAD_L - PAD_R;
  const plotH = PLOT_H - PAD_T - PAD_B;
  const m = data.xValues.length;
  const xOf = (i: number) => PAD_L + (plotW * i) / Math.max(1, m - 1);
  const yOf = (v: number) => PAD_T + plotH * (1 - (v - lo) / (hi - lo));
  return (
    <div className="cplot__withlegend">
      <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="cplot__svg plot-fill" role="img">
        <Axes lo={lo} hi={hi} xAxis={data.xAxis} yAxis={data.yAxis} />
        {data.series.map((s, si) => {
          const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
          return <path key={si} d={d} fill="none" stroke={LINE_COLORS[si % LINE_COLORS.length]} strokeWidth={1.3} />;
        })}
      </svg>
      <div className="cplot__legend">
        {data.series.map((s, si) => (
          <span key={si}>
            <span className="cplot__swatch" style={{ background: LINE_COLORS[si % LINE_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Axes({ lo, hi, xAxis, yAxis }: { lo: number; hi: number; xAxis: string; yAxis: string }) {
  const plotH = PLOT_H - PAD_T - PAD_B;
  const yOf = (v: number) => PAD_T + plotH * (1 - (v - lo) / (hi - lo));
  const zeroY = lo < 0 && hi > 0 ? yOf(0) : null;
  return (
    <g>
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="var(--border)" strokeWidth={0.6} />
      <line x1={PAD_L} y1={PAD_T + plotH} x2={PLOT_W - PAD_R} y2={PAD_T + plotH} stroke="var(--border)" strokeWidth={0.6} />
      {zeroY !== null && (
        <line x1={PAD_L} y1={zeroY} x2={PLOT_W - PAD_R} y2={zeroY} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.5} />
      )}
      <text x={PAD_L - 3} y={yOf(hi) + 3} textAnchor="end" className="cplot__tick">{hi.toFixed(2)}</text>
      <text x={PAD_L - 3} y={yOf(lo) + 3} textAnchor="end" className="cplot__tick">{lo.toFixed(2)}</text>
      <text x={(PLOT_W + PAD_L) / 2} y={PLOT_H - 0.5} textAnchor="middle" className="cplot__axis">{xAxis}</text>
      <text x={9} y={PAD_T + plotH / 2} textAnchor="middle" className="cplot__axis" transform={`rotate(-90 9 ${PAD_T + plotH / 2})`}>{yAxis}</text>
    </g>
  );
}

function HeatmapPlot({ data }: { data: Extract<PlotData, { kind: "matrix" }> }) {
  const rows = data.z.length;
  const cols = data.z[0]?.length ?? 0;
  let max = 1e-9;
  for (const r of data.z) for (const v of r) if (Number.isFinite(v) && Math.abs(v) > max) max = Math.abs(v);
  const LABEL = 26;
  const cell = Math.max(6, Math.min(22, Math.floor((PLOT_W - LABEL) / Math.max(1, cols))));
  const W = LABEL + cols * cell;
  const H = LABEL + rows * cell;
  const colTickEvery = Math.max(1, Math.ceil(cols / 12));
  const fill = (v: number) => {
    if (!Number.isFinite(v)) return { c: "var(--border)", o: 0.3 };
    if (data.signed) return { c: v >= 0 ? "var(--accent-2)" : "#ff9a5a", o: Math.min(1, Math.abs(v) / max) };
    return { c: "var(--accent)", o: Math.min(1, Math.abs(v) / max) };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cplot__svg plot-fill" role="img">
      {data.rowLabels.map((lab, r) => (
        <text key={`r${r}`} x={LABEL - 3} y={LABEL + r * cell + cell / 2 + 3} textAnchor="end" className="cplot__tick">
          {lab.length > 4 ? lab.slice(0, 4) : lab}
        </text>
      ))}
      {data.colLabels.map((lab, c) =>
        c % colTickEvery === 0 ? (
          <text key={`c${c}`} x={LABEL + c * cell + cell / 2} y={LABEL - 4} textAnchor="middle" className="cplot__tick">
            {lab.length > 4 ? lab.slice(0, 4) : lab}
          </text>
        ) : null,
      )}
      {data.z.map((row, r) =>
        row.map((v, c) => {
          const f = fill(v);
          return (
            <rect key={`${r}-${c}`} x={LABEL + c * cell} y={LABEL + r * cell} width={cell - 1} height={cell - 1} fill={f.c} fillOpacity={f.o}>
              <title>{data.rowLabels[r]}, {data.colLabels[c]}: {v.toFixed(4)}</title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}
