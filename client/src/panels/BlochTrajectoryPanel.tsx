import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { project } from "./sphere";
import { blochTrajectories } from "../sim/blochPath";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 12;
const POINTS = 96;

/**
 * Bloch trajectory — the full 3-D path each qubit's Bloch vector traces as
 * the `t` clock sweeps one period. Where the t-sweep panel shows only
 * ⟨Z⟩(t), this shows the whole curve on the sphere: a single-axis rotation
 * draws a flat circle, an off-axis or multi-frequency drive draws a tilted
 * loop or a Lissajous-like figure, and a decohering qubit spirals inward.
 *
 * Only meaningful with a free `t` symbol; statevector path, capped at 12
 * qubits, default-collapsed.
 */
export function BlochTrajectoryPanel(props: Props) {
  return (
    <PanelShell id="bloch-trajectory" title="Bloch trajectory" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
  const hasT = !!data?.freeSymbols?.includes("t");

  const result = useMemo(() => {
    if (collapsed || !hasT) return null;
    if (data?.isStabilizer || data?.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return blochTrajectories(circuit, paramValues, customGates, POINTS, MAX_QUBITS);
  }, [collapsed, hasT, data, n, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (!hasT) {
    return <div className="panel__notice">No <code>t</code> parameter — add a gate like <code>rx(t)</code> and this traces each qubit's Bloch path over one period.</div>;
  }
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no Bloch vectors to trace.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — trajectory from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the Bloch trajectory is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return (
    <div className="bloch__grid">
      {result.path.map((p, q) => (
        <Sphere key={q} qubit={q} path={p} />
      ))}
    </div>
  );
}

const SIZE = 110;
const R = 42;

function Sphere({ qubit, path }: { qubit: number; path: Array<{ x: number; y: number; z: number }> }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const pxp = project(1, 0, 0, R, cx, cy), pxn = project(-1, 0, 0, R, cx, cy);
  const pyp = project(0, 1, 0, R, cx, cy), pyn = project(0, -1, 0, R, cx, cy);
  const pzp = project(0, 0, 1, R, cx, cy), pzn = project(0, 0, -1, R, cx, cy);

  const pts = path.map((v) => { const p = project(v.x, v.y, v.z, R, cx, cy); return `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`; }).join(" ");
  const start = path[0] ? project(path[0].x, path[0].y, path[0].z, R, cx, cy) : null;
  const end = path.length ? project(path[path.length - 1].x, path[path.length - 1].y, path[path.length - 1].z, R, cx, cy) : null;

  return (
    <div className="bloch__cell">
      <svg width={SIZE} height={SIZE} className="bloch__svg">
        <circle cx={cx} cy={cy} r={R} className="bloch__outline" />
        <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.3} className="bloch__equator" />
        <line x1={pxn.sx} y1={pxn.sy} x2={pxp.sx} y2={pxp.sy} className="bloch__axis" />
        <line x1={pyn.sx} y1={pyn.sy} x2={pyp.sx} y2={pyp.sy} className="bloch__axis" />
        <line x1={pzn.sx} y1={pzn.sy} x2={pzp.sx} y2={pzp.sy} className="bloch__axis" />
        <text x={pzp.sx} y={pzp.sy - 4} className="bloch__label" textAnchor="middle">|0⟩</text>
        <text x={pzn.sx} y={pzn.sy + 10} className="bloch__label" textAnchor="middle">|1⟩</text>
        <polyline points={pts} fill="none" className="blochtraj__path" />
        {start && <circle cx={start.sx} cy={start.sy} r={2.6} className="blochtraj__start" />}
        {end && <circle cx={end.sx} cy={end.sy} r={2.6} className="blochtraj__end" />}
      </svg>
      <div className="bloch__meta">
        <div className="bloch__qubit">q{qubit}</div>
      </div>
    </div>
  );
}
