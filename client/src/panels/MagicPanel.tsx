import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { allPauliExpectations } from "../sim/pauliSpectrum";
import { magic } from "../sim/magic";

type Props = { state: SimState };

const MAX_QUBITS = 6;

/**
 * Magic (non-stabilizerness) via the stabilizer 2-Rényi entropy M₂. M₂ = 0
 * exactly when the state is a stabilizer state — what the Clifford fast
 * path can represent — and grows with every T-like gate. The bar chart is
 * the state's Pauli-weight distribution Σ_{|P|=w} Ξ_P: where the state's
 * "Pauli mass" sits, low weight (local) → high weight (scrambled).
 *
 * Statevector path only (M₂ is defined for pure states); reads all 4ⁿ
 * Pauli expectations, so capped at 6 qubits, default-collapsed.
 */
export function MagicPanel({ state }: Props) {
  return (
    <PanelShell id="magic" title="Magic (M₂)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return magic(allPauliExpectations(data.state, n), n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — the state is a stabilizer state, so M₂ = 0 by construction.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — M₂ is defined for a pure state; disable noise to measure it.</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — magic is capped at {MAX_QUBITS} (it reads all 4ⁿ Pauli expectations).</div>;
  }
  if (!result) return null;

  return <View m2={result.m2} weightDist={result.weightDist} n={n} />;
}

const W = 280;
const H = 84;
const PAD_L = 22;
const PAD_B = 14;
const PAD_T = 6;

function View({ m2, weightDist, n }: { m2: number; weightDist: number[]; n: number }) {
  const bars = weightDist;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_T - PAD_B;
  const max = Math.max(1e-9, ...bars);
  const bw = Math.max(6, Math.floor(plotW / bars.length) - 4);
  const stabiliser = m2 < 1e-6;

  return (
    <div className="magic">
      <div className="magic__stats">
        <span>M₂ = <b>{m2.toFixed(4)}</b> bit</span>
        <span>M₂/n = <b>{(m2 / n).toFixed(4)}</b></span>
        <span className={stabiliser ? "magic__tag" : "magic__tag magic__tag--magic"}>
          {stabiliser ? "stabilizer state" : "has magic"}
        </span>
      </div>
      <svg width={W} height={H} className="magic__svg" role="img">
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - 6} y2={PAD_T + plotH} className="magic__axis-line" />
        {bars.map((v, w) => {
          const h = (v / max) * plotH;
          const x = PAD_L + 2 + w * (bw + 4);
          return (
            <g key={w}>
              <rect x={x} y={PAD_T + plotH - h} width={bw} height={h} className="magic__bar">
                <title>weight {w}: Σ Ξ = {v.toFixed(4)}</title>
              </rect>
              <text x={x + bw / 2} y={H - 3} textAnchor="middle" className="magic__axis">{w}</text>
            </g>
          );
        })}
      </svg>
      <div className="magic__note">Pauli-weight distribution Σ<sub>|P|=w</sub> Ξ<sub>P</sub> (mass per weight)</div>
    </div>
  );
}
