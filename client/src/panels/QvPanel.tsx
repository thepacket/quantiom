import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { quantumVolume, type QvResult } from "../sim/quantumVolume";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * Quantum Volume. Runs square model circuits (width = depth, Haar SU(4) pairs)
 * at widths 2–5, computes the heavy-output probability vs the 2/3 threshold,
 * and reports the achieved QV = 2^(largest passing width). Needs a noise model
 * to drop below threshold (a clean model passes everything). Run on click;
 * default-collapsed.
 */
export function QvPanel({ noise }: Props) {
  return (
    <PanelShell id="quantum-volume" title="Quantum volume" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<QvResult | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(quantumVolume(noise, { widths: [2, 3, 4, 5], circuits: 20 })); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="qv">
      <div className="qv__head">
        <button className="qv__run" onClick={run} disabled={running}>{running ? "running…" : "Run QV"}</button>
        <span className="qv__note">m = 2…5 · 20 circuits/width</span>
      </div>
      {result ? <Plot r={result} /> : <div className="qv__hint">Runs square model circuits and measures the heavy-output probability against the 2/3 threshold. Enable the Noise panel to see a finite QV.</div>}
    </div>
  );
}

const W = 300, H = 165, PAD_L = 30, PAD_R = 10, PAD_T = 12, PAD_B = 28;

function Plot({ r }: { r: QvResult }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const n = r.widths.length;
  const yOf = (v: number) => PAD_T + (1 - Math.max(0, Math.min(1, v))) * plotH;
  const slot = plotW / n;
  const xOf = (i: number) => PAD_L + slot * (i + 0.5);
  const thr = 2 / 3;

  return (
    <div className="qv__out">
      <div className="qv__stats">
        <span>QV = <b>{r.quantumVolume}</b></span>
        <span>ideal HOP ≈ {r.idealHOP.toFixed(3)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="qv__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="qv__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="qv__axis-line" />
        {/* 2/3 threshold + ideal HOP reference */}
        <line x1={PAD_L} y1={yOf(thr)} x2={W - PAD_R} y2={yOf(thr)} className="qv__thresh" />
        <line x1={PAD_L} y1={yOf(r.idealHOP)} x2={W - PAD_R} y2={yOf(r.idealHOP)} className="qv__asymptote" />
        <text x={W - PAD_R} y={yOf(thr) - 2} textAnchor="end" className="qv__axis">2/3</text>
        {r.widths.map((w, i) => {
          const col = w.pass ? "#74d6a0" : "#ff8e6f";
          return (
            <g key={w.width}>
              {/* error bar */}
              <line x1={xOf(i)} y1={yOf(w.meanHOP + 2 * w.sigma)} x2={xOf(i)} y2={yOf(w.meanHOP - 2 * w.sigma)} stroke={col} strokeWidth={1.4} />
              <circle cx={xOf(i)} cy={yOf(w.meanHOP)} r={3.2} fill={col}>
                <title>m={w.width}: HOP={w.meanHOP.toFixed(3)} (2σ low {w.lower.toFixed(3)}) {w.pass ? "PASS" : "fail"}</title>
              </circle>
              <text x={xOf(i)} y={H - PAD_B + 11} textAnchor="middle" className="qv__axis">{w.width}</text>
            </g>
          );
        })}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="qv__axis">1</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="qv__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="qv__axis">width m (= depth) →</text>
      </svg>
      <div className="qv__legend">heavy-output probability with 2σ bars · green = passes (2σ low &gt; 2/3) · QV = 2^(largest passing m)</div>
    </div>
  );
}
