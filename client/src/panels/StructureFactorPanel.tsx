import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { structureFactor, type StructureFactorResult } from "../sim/structureFactor";

type Props = { state: SimState };
const MAX_QUBITS = 16;

/**
 * Static structure factor S(k) — the momentum-space Fourier transform of the
 * connected ⟨Z_jZ_l⟩ correlator along the qubit chain. A Bragg peak reveals
 * spatial order: k = 0 ferromagnetic, k = π antiferromagnetic (Néel),
 * intermediate k a density wave. Statevector path, n ≤ 16, default-collapsed.
 */
export function StructureFactorPanel({ state }: Props) {
  return (
    <PanelShell id="structure-factor" title="Structure factor S(k)" defaultCollapsed>
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
    if (n < 2 || n > MAX_QUBITS) return null;
    return structureFactor(data.state, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode for the statevector correlator.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — S(k) from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — S(k) is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Plot r={result} />;
}

const W = 300;
const H = 130;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: StructureFactorResult }) {
  const { k, s, peakK, peakS } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const sMax = Math.max(peakS, ...s, 1e-9);
  const sMin = Math.min(0, ...s);
  const span = sMax - sMin || 1;
  const xOf = (kk: number) => PAD_L + (kk / Math.PI) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v - sMin) / span) * plotH;
  const path = s.map((v, i) => `${xOf(k[i]).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const peakLabel = peakK < 0.3 ? "k≈0 (ferro)" : Math.abs(peakK - Math.PI) < 0.3 ? "k≈π (Néel)" : `k≈${peakK.toFixed(2)}`;

  return (
    <div className="sk__out">
      <div className="sk__stats">
        <span>peak <b>{peakLabel}</b></span>
        <span>S(k*) = <b>{peakS.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sk__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="sk__axis-line" />
        <line x1={PAD_L} y1={yOf(0)} x2={W - PAD_R} y2={yOf(0)} className="sk__zero" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="sk__axis-line" />
        {/* peak marker */}
        <line x1={xOf(peakK)} y1={PAD_T} x2={xOf(peakK)} y2={H - PAD_B} className="sk__peak" />
        <polyline points={path} className="sk__curve" />
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="sk__axis">{sMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="sk__axis">{sMin.toFixed(1)}</text>
        <text x={PAD_L} y={H - 6} textAnchor="start" className="sk__axis">0</text>
        <text x={xOf(Math.PI / 2)} y={H - 6} textAnchor="middle" className="sk__axis">π/2</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="sk__axis">π</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="sk__axis">momentum k →</text>
      </svg>
      <div className="sk__legend">S(k) = FT of ⟨ZⱼZₗ⟩₍c₎ · peak at k = π ⇒ antiferromagnetic order</div>
    </div>
  );
}
