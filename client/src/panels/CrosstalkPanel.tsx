import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { simultaneousRb, type SimultaneousRbResult } from "../sim/simultaneousRb";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * Simultaneous RB / crosstalk. Runs single-qubit RB on each qubit isolated vs
 * with every qubit driven at once, and plots the error-per-Clifford pair per
 * qubit. The addressability ratio EPC_simul/EPC_iso > 1 quantifies crosstalk.
 * Needs the Noise panel's crosstalk rate (and ideally a coupling map) set.
 * Run on click; default-collapsed.
 */
export function CrosstalkPanel({ noise }: Props) {
  return (
    <PanelShell id="simultaneous-rb" title="Simultaneous RB (crosstalk)" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<SimultaneousRbResult | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(simultaneousRb(noise)); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="xtalk">
      <div className="xtalk__head">
        <button className="xtalk__run" onClick={run} disabled={running}>{running ? "running…" : "Run"}</button>
        <span className="xtalk__note">isolated vs simultaneous</span>
      </div>
      {result ? <Plot r={result} /> : <div className="xtalk__hint">Compares per-qubit RB error isolated vs all-qubits-driven. Set the Noise panel's crosstalk rate (and a coupling map) to see addressability &gt; 1.</div>}
    </div>
  );
}

const W = 300, H = 160, PAD_L = 38, PAD_R = 10, PAD_T = 10, PAD_B = 26;

function Plot({ r }: { r: SimultaneousRbResult }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const maxE = Math.max(1e-4, ...r.isolated, ...r.simultaneous);
  const yOf = (v: number) => PAD_T + (1 - v / maxE) * plotH;
  const n = r.qubits.length;
  const slot = plotW / n;
  const bw = Math.min(14, slot / 3);

  return (
    <div className="xtalk__out">
      <div className="xtalk__stats">
        <span>mean addressability = <b>{r.meanAddressability.toFixed(2)}×</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="xtalk__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="xtalk__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="xtalk__axis-line" />
        {r.qubits.map((q, i) => {
          const cx = PAD_L + slot * (i + 0.5);
          const iY = yOf(r.isolated[i]), sY = yOf(r.simultaneous[i]);
          return (
            <g key={q}>
              <rect x={cx - bw - 1} y={iY} width={bw} height={H - PAD_B - iY} fill="#6fb1ff">
                <title>q{q} isolated EPC={(r.isolated[i] * 100).toFixed(3)}%</title>
              </rect>
              <rect x={cx + 1} y={sY} width={bw} height={H - PAD_B - sY} fill="#ff8e6f">
                <title>q{q} simultaneous EPC={(r.simultaneous[i] * 100).toFixed(3)}% ({r.addressability[i].toFixed(2)}×)</title>
              </rect>
              <text x={cx} y={H - PAD_B + 11} textAnchor="middle" className="xtalk__axis">q{q}</text>
            </g>
          );
        })}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="xtalk__axis">{(maxE * 100).toFixed(1)}%</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="xtalk__axis">0</text>
      </svg>
      <div className="xtalk__legend">
        <span className="xtalk__key" style={{ color: "#6fb1ff" }}>isolated</span>
        <span className="xtalk__key" style={{ color: "#ff8e6f" }}>simultaneous</span>
        EPC per qubit
      </div>
    </div>
  );
}
