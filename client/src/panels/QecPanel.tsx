import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { qecSweep, type QecResult } from "../sim/qec";

/**
 * QEC workbench: the bit-flip repetition code with a syndrome-lookup decoder.
 * Runs a Monte-Carlo logical-error-rate sweep over the physical error rate p
 * for distances 3/5/7 and plots the curves against the break-even diagonal
 * (logical = physical). The curves cross at the threshold p = ½; below it a
 * larger distance suppresses errors. Click Run; default-collapsed.
 */
export function QecPanel() {
  return (
    <PanelShell id="qec-workbench" title="QEC workbench (repetition)" defaultCollapsed>
      <Body />
    </PanelShell>
  );
}

function Body() {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<QecResult | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(qecSweep({ distances: [3, 5, 7], shots: 4000 })); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="qec">
      <div className="qec__head">
        <button className="qec__run" onClick={run} disabled={running}>{running ? "running…" : "Run sweep"}</button>
        <span className="qec__note">d = 3 / 5 / 7 · lookup decoder</span>
      </div>
      {result ? <Plot r={result} /> : <div className="qec__hint">Sweeps the physical bit-flip rate p, decodes each shot, and plots the logical error rate. The curves cross at the threshold p = ½.</div>}
    </div>
  );
}

const W = 300, H = 160, PAD_L = 34, PAD_R = 8, PAD_T = 10, PAD_B = 24;
const COLORS = ["#6fb1ff", "#9d7bff", "#ff8e6f"];

function Plot({ r }: { r: QecResult }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const pMax = r.pValues[r.pValues.length - 1] || 0.6;
  const xOf = (p: number) => PAD_L + (p / pMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / 0.6) * plotH; // logical 0..0.6
  const curve = (i: number) => r.pValues.map((p, j) => `${xOf(p).toFixed(1)},${yOf(Math.min(0.6, r.logical[i][j])).toFixed(1)}`).join(" ");

  return (
    <div className="qec__out">
      <div className="qec__stats">
        <span>threshold ≈ <b>{r.threshold.toFixed(3)}</b></span>
        <span>{r.shots} shots/pt</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="qec__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="qec__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="qec__axis-line" />
        {/* break-even diagonal logical = physical */}
        <line x1={xOf(0)} y1={yOf(0)} x2={xOf(Math.min(pMax, 0.6))} y2={yOf(Math.min(pMax, 0.6))} className="qec__diag" />
        {/* threshold marker */}
        <line x1={xOf(r.threshold)} y1={PAD_T} x2={xOf(r.threshold)} y2={H - PAD_B} className="qec__thresh" />
        <text x={xOf(r.threshold)} y={PAD_T + 7} textAnchor="middle" className="qec__axis">p_th</text>
        {r.distances.map((d, i) => (
          <polyline key={d} points={curve(i)} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={1.6} />
        ))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="qec__axis">0.6</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="qec__axis">0</text>
        <text x={PAD_L} y={H - 6} textAnchor="start" className="qec__axis">0</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="qec__axis">{pMax.toFixed(1)}</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="qec__axis">physical error p →</text>
      </svg>
      <div className="qec__legend">
        {r.distances.map((d, i) => <span key={d} className="qec__key" style={{ color: COLORS[i % COLORS.length] }}>d={d}</span>)}
        <span className="qec__key qec__key--diag">break-even (logical = physical)</span>
      </div>
    </div>
  );
}
