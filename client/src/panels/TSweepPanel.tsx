import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { tSweepZ } from "../sim/tsweep";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 14;
const POINTS = 64;

// A handful of distinguishable line colours; cycles for >8 qubits.
const LINE_COLORS = [
  "#4f9eff", "#ff9a5a", "#7ee787", "#e08bff",
  "#ffd24f", "#5ad1d1", "#ff7a9c", "#b0b8c4",
];

/**
 * t-sweep ⟨Z⟩ traces. Sweeps the `t` clock over one period [0, 2π) and
 * plots each qubit's ⟨Z_q⟩(t) as a line — the static view of an animated
 * circuit's dynamics. Shows Rabi/Larmor oscillation, a Floquet
 * stroboscopic response, or Trotterised evolution as continuous curves,
 * so you can read frequencies and beats without watching the animation.
 *
 * Only meaningful when the circuit has a free `t` symbol. Cost is one
 * simulation per sample point; statevector path, capped at 14 qubits,
 * default-collapsed.
 */
export function TSweepPanel(props: Props) {
  return (
    <PanelShell id="t-sweep" title="t-sweep ⟨Z⟩(t)" defaultCollapsed>
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
    return tSweepZ(circuit, paramValues, customGates, POINTS, MAX_QUBITS);
  }, [collapsed, hasT, data, n, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (!hasT) {
    return <div className="panel__notice">No <code>t</code> parameter — add a gate like <code>rz(t)</code> or <code>rx(t)</code> and this traces ⟨Z⟩ over one period.</div>;
  }
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no Bloch vectors to trace.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — trace from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the t-sweep is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Traces z={result.z} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 6;

function Traces({ z }: { z: number[][] }) {
  const points = z[0].length;
  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (k: number) => PAD_L + (k / (points - 1)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v + 1) / 2) * plotH; // +1 top, −1 bottom

  return (
    <div className="tsweep">
      <svg viewBox={`0 0 ${W} ${H}`} className="tsweep__svg plot-fill" role="img">
        {/* axes: 0 line, ±1 bounds */}
        <line x1={PAD_L} y1={yOf(1)} x2={W - 4} y2={yOf(1)} className="tsweep__grid" />
        <line x1={PAD_L} y1={yOf(0)} x2={W - 4} y2={yOf(0)} className="tsweep__grid tsweep__grid--zero" />
        <line x1={PAD_L} y1={yOf(-1)} x2={W - 4} y2={yOf(-1)} className="tsweep__grid" />
        <text x={PAD_L - 4} y={yOf(1) + 3} textAnchor="end" className="tsweep__axis">+1</text>
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="tsweep__axis">0</text>
        <text x={PAD_L - 4} y={yOf(-1) + 3} textAnchor="end" className="tsweep__axis">−1</text>
        <text x={PAD_L} y={H - 3} textAnchor="start" className="tsweep__axis">t=0</text>
        <text x={W - 4} y={H - 3} textAnchor="end" className="tsweep__axis">2π</text>
        {/* one polyline per qubit */}
        {z.map((row, q) => {
          const pts = row.map((v, k) => `${xOf(k).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
          return <polyline key={q} points={pts} fill="none" stroke={LINE_COLORS[q % LINE_COLORS.length]} strokeWidth={1.4} />;
        })}
      </svg>
      <div className="tsweep__legend">
        {z.map((_, q) => (
          <span key={q}><span className="tsweep__swatch" style={{ background: LINE_COLORS[q % LINE_COLORS.length] }} /> q{q}</span>
        ))}
      </div>
    </div>
  );
}
