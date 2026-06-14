import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { totalCorrelation, type TotalCorrelationResult } from "../sim/totalCorrelation";

type Props = { state: SimState };
const MAX_QUBITS = 14;

/**
 * Total correlation (multi-information) C = Σ_i S(ρ_i) − S(ρ) — the
 * all-parties generalization of mutual information. For a pure state it
 * reduces to Σ_i S(ρ_i), the total entanglement each qubit shares with the
 * rest, shown as per-qubit bars plus the total. Product state ⇒ 0; GHZ ⇒ n
 * bits. Statevector path, n ≤ 14, default-collapsed.
 */
export function TotalCorrelationPanel({ state }: Props) {
  return (
    <PanelShell id="total-correlation" title="Total correlation" defaultCollapsed>
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
    return totalCorrelation(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrices.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — single-trajectory entropies aren't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 100;

function Plot({ r }: { r: TotalCorrelationResult }) {
  const { perQubit, total } = r;
  const bw = Math.max(6, Math.floor((W - 4) / perQubit.length) - 3);
  return (
    <div className="totcorr__out">
      <div className="totcorr__stats">
        <span>C = <b>{total.toFixed(3)}</b> bit</span>
        <span>{perQubit.length} qubits</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="totcorr__svg plot-fill" role="img">
        <line x1={0} y1={H - 14} x2={W} y2={H - 14} className="totcorr__axis-line" />
        {perQubit.map((s, q) => {
          const h = s * (H - 20);
          const x = 2 + q * (bw + 3);
          return (
            <g key={q}>
              <rect x={x} y={H - 14 - h} width={bw} height={h} className="totcorr__bar"><title>q{q}: S(ρ) = {s.toFixed(3)}</title></rect>
              <text x={x + bw / 2} y={H - 3} textAnchor="middle" className="totcorr__axis">{q}</text>
            </g>
          );
        })}
      </svg>
      <div className="totcorr__legend">per-qubit S(ρ_i); Σ = total correlation (all-parties, classical + quantum)</div>
    </div>
  );
}
