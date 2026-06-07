import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { xeb, type XebResult } from "../sim/xeb";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * Cross-entropy benchmarking (XEB). Runs random brickwork circuits at growing
 * cycle counts and plots the linear XEB fidelity (1 for an ideal device, 0 for
 * the uniform distribution), which decays exponentially per cycle under noise.
 * Run on click; enable the Noise panel to see the decay.
 * Default-collapsed.
 */
export function XebPanel({ noise }: Props) {
  return (
    <PanelShell id="xeb" title="Cross-entropy benchmarking" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<XebResult | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(xeb(noise, { numQubits: 4, circuits: 8 })); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="xeb">
      <div className="xeb__head">
        <button className="xeb__run" onClick={run} disabled={running}>{running ? "running…" : "Run XEB"}</button>
        <span className="xeb__note">4q · 8 circuits/depth</span>
      </div>
      {result ? <Plot r={result} /> : <div className="xeb__hint">Runs random brickwork circuits and computes the linear XEB fidelity vs depth. Enable the Noise panel to see the per-cycle decay.</div>}
    </div>
  );
}

const W = 300, H = 150, PAD_L = 30, PAD_R = 8, PAD_T = 10, PAD_B = 24;

function Plot({ r }: { r: XebResult }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const dMax = r.depths[r.depths.length - 1] || 1;
  const xOf = (d: number) => PAD_L + (d / dMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - Math.max(0, Math.min(1, v))) * plotH;
  const samples = 60;
  const fitPath = Array.from({ length: samples + 1 }, (_, i) => {
    const d = (dMax * i) / samples;
    return `${xOf(d).toFixed(1)},${yOf(Math.pow(r.perCycle, d)).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="xeb__out">
      <div className="xeb__stats">
        <span>per-cycle λ = <b>{r.perCycle.toFixed(4)}</b></span>
        <span>{r.numQubits} qubits</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="xeb__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="xeb__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="xeb__axis-line" />
        <polyline points={fitPath} className="rb__fit" />
        {r.depths.map((d, i) => (
          <circle key={i} cx={xOf(d)} cy={yOf(r.fidelity[i])} r={2.4} className="rb__dot">
            <title>depth {d}: F={r.fidelity[i].toFixed(3)}</title>
          </circle>
        ))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="xeb__axis">1</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="xeb__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="xeb__axis">cycles (depth) →</text>
      </svg>
      <div className="xeb__legend">linear XEB fidelity (1 ideal, 0 uniform) ≈ λ^depth</div>
    </div>
  );
}
