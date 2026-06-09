import { useEffect, useMemo, useRef, useState } from "react";
import { PanelShell, usePanelCollapsed, setPanelCollapsed } from "./PanelShell";
import {
  computePlot,
  coercePlotSpec,
  defaultChart,
  chartChoicesFor,
  isSweepable,
  isParameterized,
  plotTitle,
  PLOT_QUANTITIES,
  QUANTITY_LABELS,
  type PlotArgs,
  type PlotChart,
  type PlotData,
  type PlotQuantity,
  type PlotSpec,
  type PlotSweep,
} from "../sim/plotSpec";
import {
  buildPlotProgramInput,
  runPlotProgram,
  type PlotProgramResult,
  type PlotScene,
} from "../sim/plotProgram";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

/** A saved plot: either a validated spec, or a sandboxed code program. */
type SavedPlot =
  | { kind: "spec"; spec: PlotSpec }
  | { kind: "program"; code: string; title?: string };

const STORAGE_KEY = "quantiom:custom-plots:v1";
/** Window event the AI chat dispatches to add a spec-based plot.
 *  detail: a raw object coerced through `coercePlotSpec`. */
export const ADD_PLOT_EVENT = "quantiom:add-plot";
/** Window event the AI chat dispatches to add a code (program) plot.
 *  detail: { code: string, title?: string }. */
export const ADD_PROGRAM_EVENT = "quantiom:add-plot-program";

/** Dispatch a request to add a spec plot (used by the AI chat). */
export function requestCustomPlot(raw: unknown): PlotSpec | null {
  const spec = coercePlotSpec(raw);
  if (!spec) return null;
  window.dispatchEvent(new CustomEvent(ADD_PLOT_EVENT, { detail: spec }));
  setPanelCollapsed("custom-plots", false);
  return spec;
}

/** Dispatch a request to add a sandboxed code plot (used by the AI chat). */
export function requestCustomPlotProgram(code: string, title?: string): boolean {
  if (typeof code !== "string" || !code.trim()) return false;
  window.dispatchEvent(new CustomEvent(ADD_PROGRAM_EVENT, { detail: { code, title } }));
  setPanelCollapsed("custom-plots", false);
  return true;
}

function loadPlots(): SavedPlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: SavedPlot[] = [];
    for (const e of arr) {
      if (e && typeof e === "object" && e.kind === "program" && typeof e.code === "string") {
        out.push({ kind: "program", code: e.code, title: typeof e.title === "string" ? e.title : undefined });
      } else {
        // Bare spec (legacy) or { kind: "spec", spec }.
        const spec = coercePlotSpec(e && e.kind === "spec" ? e.spec : e);
        if (spec) out.push({ kind: "spec", spec });
      }
    }
    return out;
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

const STARTER_CODE = `// data = { n, dim, ampRe[], ampIm[], prob[], numColumns,
//   numClbits, clbits, counts, shots, rho1, width, height, palette }
// return { width, height, title?, elements:[...] }
const W = data.width, H = data.height, bw = W / data.dim;
const els = data.prob.map((p, i) => ({
  type: "rect", x: i * bw, y: H - p * H, width: bw * 0.8, height: p * H,
  fill: data.palette.accent,
}));
return { width: W, height: H, title: "probabilities", elements: els };`;

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const [plots, setPlots] = useState<SavedPlot[]>(loadPlots);

  // Builder draft state.
  const [quantity, setQuantity] = useState<PlotQuantity>("expZ");
  const [sweep, setSweep] = useState<PlotSweep>("none");
  const [chart, setChart] = useState<PlotChart>("bars");
  const [args, setArgs] = useState<PlotArgs>({ pauli: "Z", hamiltonian: "ZZ + 0.5 X", cut: 1, wPauli: "Z", wQubit: 0, vPauli: "Z", vQubit: 1 });
  const setArg = (k: keyof PlotArgs, v: string | number) => setArgs((a) => ({ ...a, [k]: v }));

  // Persist.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
    } catch {
      /* ignore */
    }
  }, [plots]);

  // Listen for AI-/external-pushed plots (spec + program).
  useEffect(() => {
    const onAddSpec = (e: Event) => {
      const spec = (e as CustomEvent).detail as PlotSpec | undefined;
      if (spec && PLOT_QUANTITIES.includes(spec.quantity)) setPlots((prev) => [{ kind: "spec", spec }, ...prev]);
    };
    const onAddProgram = (e: Event) => {
      const d = (e as CustomEvent).detail as { code?: string; title?: string } | undefined;
      if (d && typeof d.code === "string" && d.code.trim()) {
        setPlots((prev) => [{ kind: "program", code: d.code as string, title: d.title }, ...prev]);
      }
    };
    window.addEventListener(ADD_PLOT_EVENT, onAddSpec);
    window.addEventListener(ADD_PROGRAM_EVENT, onAddProgram);
    return () => {
      window.removeEventListener(ADD_PLOT_EVENT, onAddSpec);
      window.removeEventListener(ADD_PROGRAM_EVENT, onAddProgram);
    };
  }, []);

  // Keep the draft chart/sweep compatible when the quantity/sweep change.
  const sweepable = isSweepable(quantity);
  useEffect(() => {
    if (!sweepable && sweep !== "none") setSweep("none");
  }, [sweepable, sweep]);
  useEffect(() => {
    setChart(defaultChart(quantity, sweep));
  }, [quantity, sweep]);

  const addCurrent = () =>
    setPlots((prev) => [{ kind: "spec", spec: { quantity, sweep, chart, args: isParameterized(quantity) ? args : undefined } }, ...prev]);
  const addCode = () => setPlots((prev) => [{ kind: "program", code: STARTER_CODE, title: "code plot" }, ...prev]);
  const removeAt = (i: number) => setPlots((prev) => prev.filter((_, k) => k !== i));
  const updateCode = (i: number, code: string) =>
    setPlots((prev) => prev.map((p, k) => (k === i && p.kind === "program" ? { ...p, code } : p)));

  const chartChoices: PlotChart[] = chartChoicesFor(quantity, sweep);

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
          <select value={sweep} onChange={(e) => setSweep(e.target.value as PlotSweep)} disabled={!sweepable}>
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
        {quantity === "pauli" && (
          <label className="cplot__field">
            <span>Pauli string</span>
            <input className="cplot__arg" value={args.pauli ?? ""} placeholder="ZIZ" onChange={(e) => setArg("pauli", e.target.value)} />
          </label>
        )}
        {(quantity === "energy" || quantity === "energySpectrum") && (
          <label className="cplot__field cplot__field--wide">
            <span>Hamiltonian (Pauli sum)</span>
            <input className="cplot__arg" value={args.hamiltonian ?? ""} placeholder="ZZ + 0.5 X" onChange={(e) => setArg("hamiltonian", e.target.value)} />
          </label>
        )}
        {quantity === "schmidt" && (
          <label className="cplot__field">
            <span>cut k</span>
            <input className="cplot__arg cplot__arg--num" type="number" min={1} value={args.cut ?? 1} onChange={(e) => setArg("cut", parseInt(e.target.value, 10) || 1)} />
          </label>
        )}
        {quantity === "otoc" && (
          <>
            <label className="cplot__field">
              <span>W</span>
              <span className="cplot__arg-row">
                <select value={args.wPauli ?? "Z"} onChange={(e) => setArg("wPauli", e.target.value)}>
                  {["X", "Y", "Z"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input className="cplot__arg cplot__arg--num" type="number" min={0} value={args.wQubit ?? 0} onChange={(e) => setArg("wQubit", parseInt(e.target.value, 10) || 0)} />
              </span>
            </label>
            <label className="cplot__field">
              <span>V</span>
              <span className="cplot__arg-row">
                <select value={args.vPauli ?? "Z"} onChange={(e) => setArg("vPauli", e.target.value)}>
                  {["X", "Y", "Z"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input className="cplot__arg cplot__arg--num" type="number" min={0} value={args.vQubit ?? 1} onChange={(e) => setArg("vQubit", parseInt(e.target.value, 10) || 0)} />
              </span>
            </label>
          </>
        )}
        <button className="cplot__add" onClick={addCurrent} title="Add this plot">
          + plot
        </button>
        <button className="cplot__add" onClick={addCode} title="Add a sandboxed code plot (advanced)">
          + code
        </button>
      </div>

      {plots.length === 0 ? (
        <div className="panel__placeholder">
          build a plot above, add a <strong>+ code</strong> plot, or ask the AI assistant (e.g. “plot ⟨X⟩ for each qubit vs circuit depth”)
        </div>
      ) : (
        <div className="cplot__list">
          {plots.map((p, i) =>
            p.kind === "spec" ? (
              <PlotCard
                key={i}
                spec={p.spec}
                circuit={circuit}
                customGates={customGates}
                paramValues={paramValues}
                collapsed={collapsed}
                onRemove={() => removeAt(i)}
              />
            ) : (
              <ProgramCard
                key={i}
                code={p.code}
                title={p.title}
                circuit={circuit}
                customGates={customGates}
                paramValues={paramValues}
                collapsed={collapsed}
                onRemove={() => removeAt(i)}
                onCode={(code) => updateCode(i, code)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ─── program (sandboxed code) card ─────────────────────────────────────

function ProgramCard({
  code,
  title,
  circuit,
  customGates,
  paramValues,
  collapsed,
  onRemove,
  onCode,
}: {
  code: string;
  title?: string;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  collapsed: boolean;
  onRemove: () => void;
  onCode: (code: string) => void;
}) {
  const [result, setResult] = useState<PlotProgramResult | null>(null);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);
  const runId = useRef(0);

  // Re-run the program in the sandbox whenever the code/circuit/params change
  // (and the panel is open). Stale runs are ignored via the run id.
  useEffect(() => {
    if (collapsed) return;
    const input = buildPlotProgramInput(circuit, paramValues, customGates);
    if ("error" in input) {
      setResult({ error: input.error });
      return;
    }
    const id = ++runId.current;
    setRunning(true);
    runPlotProgram(code, input).then((r) => {
      if (runId.current === id) {
        setResult(r);
        setRunning(false);
      }
    });
    return () => { runId.current++; }; // invalidate on unmount/dep change
  }, [collapsed, code, circuit, paramValues, customGates]);

  return (
    <div className="cplot__card">
      <div className="cplot__card-head">
        <span className="cplot__card-title">{title || "code plot"} <span className="cplot__badge">sandbox</span></span>
        <span className="cplot__card-actions">
          <button className="cplot__edit" onClick={() => setEditing((e) => !e)} title="Edit the code">
            {editing ? "done" : "edit"}
          </button>
          <button className="cplot__remove" onClick={onRemove} title="Remove this plot">×</button>
        </span>
      </div>
      {editing && (
        <textarea
          className="cplot__code"
          value={code}
          spellCheck={false}
          onChange={(e) => onCode(e.target.value)}
          rows={Math.min(16, Math.max(6, code.split("\n").length + 1))}
        />
      )}
      {running && !result ? (
        <div className="panel__notice">running…</div>
      ) : result && "error" in result ? (
        <div className="panel__notice">{result.error}</div>
      ) : result ? (
        <ScenePlot scene={result.scene} />
      ) : null}
    </div>
  );
}

/** Render a sanitised PlotScene to SVG. All values are already validated by
 *  `sanitizePlotScene`; React escapes text, so this is purely declarative. */
function ScenePlot({ scene }: { scene: PlotScene }) {
  return (
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="cplot__svg plot-fill" role="img">
      {scene.elements.map((el, i) => {
        switch (el.type) {
          case "line":
            return <line key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
          case "rect":
            return <rect key={i} x={el.x} y={el.y} width={el.width} height={el.height} fill={el.fill} stroke={el.stroke} fillOpacity={el.opacity} />;
          case "circle":
            return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} fill={el.fill} stroke={el.stroke} fillOpacity={el.opacity} />;
          case "path":
            return <path key={i} d={el.d} stroke={el.stroke} fill={el.fill} strokeWidth={el.strokeWidth} />;
          case "polyline":
            return <polyline key={i} points={el.points.map((p) => `${p[0]},${p[1]}`).join(" ")} stroke={el.stroke} fill={el.fill} strokeWidth={el.strokeWidth} />;
          case "text":
            return <text key={i} x={el.x} y={el.y} fill={el.fill} textAnchor={el.anchor} fontSize={el.size}>{el.text}</text>;
          default:
            return null;
        }
      })}
    </svg>
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
  if (data.kind === "scatter") return <ScatterPlot data={data} />;
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

function ScatterPlot({ data }: { data: Extract<PlotData, { kind: "scatter" }> }) {
  const xs = data.points.map((p) => p.x);
  const ys = data.points.map((p) => p.y);
  // Symmetric square range about 0 so the complex plane isn't distorted.
  let m = 1e-9;
  for (const v of [...xs, ...ys]) if (Number.isFinite(v) && Math.abs(v) > m) m = Math.abs(v);
  const plotW = PLOT_W - PAD_L - PAD_R;
  const plotH = PLOT_H - PAD_T - PAD_B;
  const xOf = (x: number) => PAD_L + plotW * (0.5 + 0.5 * (x / m));
  const yOf = (y: number) => PAD_T + plotH * (0.5 - 0.5 * (y / m));
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} className="cplot__svg plot-fill" role="img">
      {/* axes through the origin */}
      <line x1={PAD_L} y1={yOf(0)} x2={PLOT_W - PAD_R} y2={yOf(0)} stroke="var(--border)" strokeWidth={0.6} />
      <line x1={xOf(0)} y1={PAD_T} x2={xOf(0)} y2={PAD_T + plotH} stroke="var(--border)" strokeWidth={0.6} />
      {data.points.map((p, i) =>
        Math.hypot(p.x, p.y) < 1e-9 ? null : (
          <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r={2.2} fill="var(--accent)" fillOpacity={0.8}>
            <title>|{p.label}⟩: {p.x.toFixed(3)} {p.y >= 0 ? "+" : "−"} {Math.abs(p.y).toFixed(3)}i</title>
          </circle>
        ),
      )}
      <text x={PLOT_W - PAD_R} y={yOf(0) - 2} textAnchor="end" className="cplot__axis">{data.xAxis}</text>
      <text x={xOf(0) + 3} y={PAD_T + 6} className="cplot__axis">{data.yAxis}</text>
      <text x={PAD_L - 3} y={PAD_T + 6} textAnchor="end" className="cplot__tick">{m.toFixed(2)}</text>
    </svg>
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
