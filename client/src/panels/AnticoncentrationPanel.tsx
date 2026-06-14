import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { anticoncentration, type AnticoncentrationResult } from "../sim/anticoncentration";

type Props = { state: SimState };
const MAX_QUBITS = 16;

/**
 * Anticoncentration / Porter–Thomas test — histograms the rescaled output
 * probabilities y = 2ⁿ·|⟨x|ψ⟩|² against the Porter–Thomas law e^{−y} that a
 * Haar-random (scrambling) circuit follows. The collision ratio R = 2ⁿ·Σp² is
 * the sharp scalar: R = 1 flat, R = 2 Porter–Thomas (anticoncentrated), R ≫ 2
 * peaked. The distribution underpinning random-circuit sampling and XEB.
 * Statevector path, n ≤ 16, default-collapsed.
 */
export function AnticoncentrationPanel({ state }: Props) {
  return (
    <PanelShell id="anticoncentration" title="Anticoncentration (Porter–Thomas)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return anticoncentration(data.state, n, 24, 6, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector probabilities.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — use the exact statevector for the output distribution.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;

function Plot({ r }: { r: AnticoncentrationResult }) {
  const { centers, density, ptCurve, collisionRatio } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(...density, ...ptCurve, 0.01);
  const xMax = centers[centers.length - 1] + (centers[1] - centers[0]) / 2;
  const xOf = (y: number) => PAD_L + (y / xMax) * plotW;
  const yOf = (d: number) => PAD_T + (1 - d / yMax) * plotH;
  const bw = Math.max(2, plotW / centers.length - 1);
  const ptPath = ptCurve.map((d, i) => `${xOf(centers[i]).toFixed(1)},${yOf(d).toFixed(1)}`).join(" ");
  return (
    <div className="anti__out">
      <div className="anti__stats">
        <span>collision R = <b>{collisionRatio.toFixed(3)}</b></span>
        <span className="anti__tag">{collisionRatio < 1.3 ? "flat" : Math.abs(collisionRatio - 2) < 0.4 ? "Porter–Thomas" : collisionRatio > 4 ? "peaked" : "intermediate"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="anti__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="anti__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="anti__axis-line" />
        {density.map((d, i) => {
          const h = (d / yMax) * plotH;
          return <rect key={i} x={xOf(centers[i]) - bw / 2} y={H - PAD_B - h} width={bw} height={h} className="anti__bar"><title>y≈{centers[i].toFixed(2)}: {d.toFixed(3)}</title></rect>;
        })}
        <polyline points={ptPath} className="anti__pt" />
        <text x={PAD_L} y={H - 5} className="anti__axis">0</text>
        <text x={W - PAD_R} y={H - 5} textAnchor="end" className="anti__axis">y = D·p</text>
      </svg>
      <div className="anti__legend">histogram of D·|⟨x|ψ⟩|² vs Porter–Thomas e<sup>−y</sup> (line) · R = 2 ⇒ anticoncentrated</div>
    </div>
  );
}
