import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { multifractal, type MultifractalResult } from "../sim/multifractal";

type Props = { state: SimState };
const MAX_QUBITS = 16;

/**
 * Multifractal spectrum D_q of the wavefunction — the generalized fractal
 * dimensions from the inverse-participation moments I_q = Σ p_xᵍ. D_q ≈ 1 for
 * all q is a fully delocalised (ergodic) state; D_q ≈ 0 is localised; a curve
 * that falls with q is **multifractal** (the critical regime). A finer
 * localization probe than the single IPR. Statevector path, n ≤ 16,
 * default-collapsed.
 */
export function MultifractalPanel({ state }: Props) {
  return (
    <PanelShell id="multifractal" title="Multifractal spectrum D_q" defaultCollapsed>
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
    return multifractal(data.state, n, undefined, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs the statevector probabilities.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — use the exact statevector.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;

function Plot({ r }: { r: MultifractalResult }) {
  const { qs, dq, d2, dInf } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const qMax = qs[qs.length - 1];
  const qMin = qs[0];
  const xOf = (q: number) => PAD_L + ((q - qMin) / (qMax - qMin || 1)) * plotW;
  const yOf = (d: number) => PAD_T + (1 - Math.max(0, Math.min(1, d))) * plotH;
  const path = dq.map((d, i) => `${xOf(qs[i]).toFixed(1)},${yOf(d).toFixed(1)}`).join(" ");
  return (
    <div className="mfrac__out">
      <div className="mfrac__stats">
        <span>D₂ = <b>{d2.toFixed(3)}</b></span>
        <span>D∞ = <b>{dInf.toFixed(3)}</b></span>
        <span className="mfrac__tag">{d2 > 0.92 ? "ergodic (D_q≈1)" : d2 < 0.2 ? "localized" : "multifractal"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mfrac__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="mfrac__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="mfrac__axis-line" />
        <line x1={PAD_L} y1={yOf(1)} x2={W - PAD_R} y2={yOf(1)} className="mfrac__one" />
        <polyline points={path} className="mfrac__curve" />
        {dq.map((d, i) => <circle key={i} cx={xOf(qs[i])} cy={yOf(d)} r={2.2} className="mfrac__dot"><title>D_{qs[i]} = {d.toFixed(3)}</title></circle>)}
        <text x={PAD_L - 4} y={yOf(1) + 3} textAnchor="end" className="mfrac__axis">1</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="mfrac__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="mfrac__axis">Rényi order q →</text>
      </svg>
      <div className="mfrac__legend">D_q vs q · flat at 1 ⇒ ergodic, falling ⇒ multifractal, ≈ 0 ⇒ localized</div>
    </div>
  );
}
