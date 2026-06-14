import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { spinSqueezing, type SpinSqueezingResult } from "../sim/spinSqueezing";

type Props = { state: SimState };
const MAX_QUBITS = 14;

/**
 * Wineland spin-squeezing parameter ξ_R² = N (ΔJ_⊥,min)² / |⟨J⟩|² — the
 * collective-spin metrology figure of merit and an entanglement witness.
 * ξ_R² < 1 certifies squeezing useful beyond the standard quantum limit (and
 * multipartite entanglement); the gain is −10 log₁₀ ξ_R² dB. Statevector path,
 * n ≤ 14, default-collapsed.
 */
export function SpinSqueezingPanel({ state }: Props) {
  return (
    <PanelShell id="spin-squeezing" title="Spin squeezing ξ²" defaultCollapsed>
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
    return spinSqueezing(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — the collective-spin moments need the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — squeezing from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <View r={result} />;
}

const W = 300;
const H = 40;

function View({ r }: { r: SpinSqueezingResult }) {
  const defined = Number.isFinite(r.xiR2);
  // Gauge bar: map ξ² ∈ [0, 2] across the width, mark the ξ²=1 SQL line.
  const clamp = Math.min(2, Math.max(0, r.xiR2));
  const xOf = (v: number) => 4 + (v / 2) * (W - 8);

  return (
    <div className="squeeze">
      <div className={"squeeze__hero " + (r.squeezed ? "squeeze__hero--ok" : "squeeze__hero--no")}>
        ξ²<sub>R</sub> = <b>{defined ? r.xiR2.toFixed(4) : "—"}</b>
        {defined && <span className="squeeze__tag">{r.squeezed ? `squeezed · ${r.dB.toFixed(1)} dB gain` : "not squeezed (≥ SQL)"}</span>}
      </div>
      {defined ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="squeeze__svg plot-fill" role="img">
          <line x1={4} y1={H / 2} x2={W - 4} y2={H / 2} className="squeeze__track" />
          <line x1={xOf(1)} y1={6} x2={xOf(1)} y2={H - 6} className="squeeze__sql" />
          <text x={xOf(1)} y={H - 1} textAnchor="middle" className="squeeze__axis">SQL (1)</text>
          <circle cx={xOf(clamp)} cy={H / 2} r={5} className={r.squeezed ? "squeeze__dot squeeze__dot--ok" : "squeeze__dot"} />
          <text x={6} y={10} className="squeeze__axis">0</text>
          <text x={W - 6} y={10} textAnchor="end" className="squeeze__axis">2</text>
        </svg>
      ) : (
        <div className="panel__notice">|⟨J⟩| ≈ 0 (e.g. GHZ) — Wineland ξ² is undefined here; the QFI panel is the right witness.</div>
      )}
      <div className="squeeze__stats">
        <span>|⟨J⟩| = <b>{r.meanLength.toFixed(3)}</b></span>
        <span>ΔJ²<sub>⊥,min</sub> = <b>{r.minPerpVariance.toFixed(4)}</b></span>
      </div>
    </div>
  );
}
