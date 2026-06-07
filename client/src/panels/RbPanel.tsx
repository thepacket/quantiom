import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { randomizedBenchmarking, type RbResult } from "../sim/randomizedBenchmarking";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * Single-qubit randomized benchmarking. Runs K random Clifford sequences of
 * increasing length under the noise model, fits the survival-probability decay
 * P(m) = A·p^m + ½, and reports the error per Clifford r = (1−p)/2 — the
 * SPAM-robust gate-error metric. Click Run; needs a non-zero 1-qubit noise
 * rate to show any decay. Default-collapsed.
 */
export function RbPanel({ noise }: Props) {
  return (
    <PanelShell id="randomized-benchmarking" title="Randomized benchmarking" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<RbResult | null>(null);
  const [running, setRunning] = useState(false);

  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    // Defer so the button shows "running…" before the (synchronous) sweep.
    setTimeout(() => {
      try { setResult(randomizedBenchmarking(noise)); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="rb">
      <div className="rb__head">
        <button className="rb__run" onClick={run} disabled={running}>{running ? "running…" : "Run RB"}</button>
        <span className="rb__note">single-qubit · {noise.trajectories} shots/seq</span>
      </div>
      {result && <Plot r={result} />}
      {!result && <div className="rb__hint">Runs random Clifford sequences and fits the fidelity decay. Set a 1-qubit depolarising / damping rate in the Noise panel first.</div>}
    </div>
  );
}

const W = 300, H = 150, PAD_L = 30, PAD_R = 8, PAD_T = 10, PAD_B = 22;

function Plot({ r }: { r: RbResult }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const mMax = r.lengths[r.lengths.length - 1] || 1;
  const xOf = (m: number) => PAD_L + (m / mMax) * plotW;
  const yOf = (pp: number) => PAD_T + (1 - pp) * plotH; // survival 0..1
  const fit = (m: number) => r.A * Math.pow(r.p, m) + r.B;
  const samples = 60;
  const fitPath = Array.from({ length: samples + 1 }, (_, i) => {
    const m = (mMax * i) / samples;
    return `${xOf(m).toFixed(1)},${yOf(Math.max(0, Math.min(1, fit(m)))).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="rb__out">
      <div className="rb__stats">
        <span>p = <b>{r.p.toFixed(4)}</b></span>
        <span>EPC = <b>{(r.epc * 100).toFixed(3)}%</b></span>
        <span>{r.sequences} seq/len</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="rb__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="rb__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="rb__axis-line" />
        {/* B (asymptote) reference */}
        <line x1={PAD_L} y1={yOf(r.B)} x2={W - PAD_R} y2={yOf(r.B)} className="rb__asymptote" />
        <polyline points={fitPath} className="rb__fit" />
        {r.lengths.map((m, i) => (
          <circle key={i} cx={xOf(m)} cy={yOf(r.survival[i])} r={2.4} className="rb__dot">
            <title>m={m}: P={r.survival[i].toFixed(3)}</title>
          </circle>
        ))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="rb__axis">1</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="rb__axis">0</text>
        <text x={PAD_L + 2} y={yOf(r.B) - 2} className="rb__axis">½</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="rb__axis">sequence length m →</text>
      </svg>
      <div className="rb__legend">survival P(|0⟩) decays as A·p^m + ½ · EPC = (1−p)/2 (SPAM-robust gate error)</div>
    </div>
  );
}
