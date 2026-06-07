import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { t1t2, type T1T2Result } from "../sim/t1t2";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * T1 / T2 experiments. T1 = inversion recovery (prepare |1⟩, idle, read P(|1⟩));
 * T2* = Ramsey (prepare |+⟩, idle, H, read P(|0⟩)). The idle is a chain of
 * identity gates so the noise model's per-gate damping accumulates; fits give
 * the decay constants in gate-times. Needs amplitude/phase damping set in the
 * Noise panel. Run on click; default-collapsed.
 */
export function T1T2Panel({ noise }: Props) {
  return (
    <PanelShell id="t1-t2" title="T1 / T2 experiments" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<T1T2Result | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(t1t2(noise)); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="t12">
      <div className="t12__head">
        <button className="t12__run" onClick={run} disabled={running}>{running ? "running…" : "Run"}</button>
        <span className="t12__note">delay in gate-times · {noise.trajectories} traj</span>
      </div>
      {result ? <Plot r={result} /> : <div className="t12__hint">Inversion-recovery (T1) and Ramsey (T2) decay curves. Set amplitude / phase damping in the Noise panel first.</div>}
    </div>
  );
}

const W = 300, H = 155, PAD_L = 30, PAD_R = 8, PAD_T = 10, PAD_B = 24;
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "∞");

function Plot({ r }: { r: T1T2Result }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const tMax = r.delays[r.delays.length - 1] || 1;
  const xOf = (t: number) => PAD_L + (t / tMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - Math.max(0, Math.min(1, v))) * plotH;
  const line = (ys: number[]) => r.delays.map((t, i) => `${xOf(t).toFixed(1)},${yOf(ys[i]).toFixed(1)}`).join(" ");

  return (
    <div className="t12__out">
      <div className="t12__stats">
        <span style={{ color: "#6fb1ff" }}>T1 = <b>{fmt(r.T1)}</b></span>
        <span style={{ color: "#ff8e6f" }}>T2 = <b>{fmt(r.T2)}</b></span>
        <span>gate-times</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="t12__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="t12__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="t12__axis-line" />
        <line x1={PAD_L} y1={yOf(0.5)} x2={W - PAD_R} y2={yOf(0.5)} className="rb__asymptote" />
        <polyline points={line(r.t1Curve)} fill="none" stroke="#6fb1ff" strokeWidth={1.6} />
        <polyline points={line(r.t2Curve)} fill="none" stroke="#ff8e6f" strokeWidth={1.6} />
        {r.delays.map((t, i) => <circle key={`a${i}`} cx={xOf(t)} cy={yOf(r.t1Curve[i])} r={1.8} fill="#6fb1ff" />)}
        {r.delays.map((t, i) => <circle key={`b${i}`} cx={xOf(t)} cy={yOf(r.t2Curve[i])} r={1.8} fill="#ff8e6f" />)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="t12__axis">1</text>
        <text x={PAD_L + 2} y={yOf(0.5) - 2} className="t12__axis">½</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="t12__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="t12__axis">idle delay (gates) →</text>
      </svg>
      <div className="t12__legend">
        <span className="t12__key" style={{ color: "#6fb1ff" }}>T1: P(|1⟩)</span>
        <span className="t12__key" style={{ color: "#ff8e6f" }}>T2: Ramsey P(|0⟩)</span>
      </div>
    </div>
  );
}
