import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { mirrorBenchmark, type MirrorResult } from "../sim/mirrorBenchmark";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };

/**
 * Mirror / volumetric benchmarking. Runs random Clifford-layer mirror circuits
 * (forward + exact inverse) over a width × depth grid and plots the success
 * probability P(|0…0⟩) as a heatmap. The frontier where P drops to ½ traces the
 * largest circuit shapes the noise model can still execute. Run on click;
 * needs the Noise panel enabled to show structure. Default-collapsed.
 */
export function MirrorPanel({ noise }: Props) {
  return (
    <PanelShell id="mirror-benchmark" title="Mirror / volumetric" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [result, setResult] = useState<MirrorResult | null>(null);
  const [running, setRunning] = useState(false);
  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try { setResult(mirrorBenchmark(noise, { circuits: 6 })); } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="mirror">
      <div className="mirror__head">
        <button className="mirror__run" onClick={run} disabled={running}>{running ? "running…" : "Run grid"}</button>
        <span className="mirror__note">width × depth · 6 circuits/cell</span>
      </div>
      {result ? <Grid r={result} /> : <div className="mirror__hint">Sweeps mirror circuits over a width × depth grid; each cell is the mean P(|0…0⟩). Enable the Noise panel to see the capability frontier.</div>}
    </div>
  );
}

/** Blue (1) → yellow (½) → red (0) success colour. */
function heat(p: number): string {
  const v = Math.max(0, Math.min(1, p));
  // 0 → red, 0.5 → yellow, 1 → green/blue
  const hue = v * 140; // 0=red .. 140=green
  return `hsl(${hue} 70% ${28 + v * 18}%)`;
}

function Grid({ r }: { r: MirrorResult }) {
  const cell = 34, labelL = 26, labelB = 18, padT = 6, padR = 6;
  const W = labelL + r.depths.length * cell + padR;
  const H = padT + r.widths.length * cell + labelB;
  return (
    <div className="mirror__out">
      <svg viewBox={`0 0 ${W} ${H}`} className="mirror__svg plot-fill" role="img">
        {r.widths.map((w, i) =>
          r.depths.map((d, j) => {
            const p = r.success[i][j];
            const x = labelL + j * cell, y = padT + i * cell;
            return (
              <g key={`${i}-${j}`}>
                <rect x={x} y={y} width={cell - 1} height={cell - 1} fill={heat(p)}>
                  <title>width {w} × depth {d}: P={p.toFixed(3)}</title>
                </rect>
                <text x={x + cell / 2} y={y + cell / 2 + 3} textAnchor="middle" className="mirror__cell">{p.toFixed(2)}</text>
              </g>
            );
          }),
        )}
        {r.widths.map((w, i) => (
          <text key={`w${w}`} x={labelL - 4} y={padT + i * cell + cell / 2 + 3} textAnchor="end" className="mirror__axis">{w}</text>
        ))}
        {r.depths.map((d, j) => (
          <text key={`d${d}`} x={labelL + j * cell + cell / 2} y={H - 5} textAnchor="middle" className="mirror__axis">{d}</text>
        ))}
      </svg>
      <div className="mirror__legend">rows = width · cols = forward depth · cell = success P(|0…0⟩)</div>
    </div>
  );
}
