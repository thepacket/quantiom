import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { correlationLength, type CorrelationLengthResult } from "../sim/correlationLength";

type Props = { state: SimState };
const MAX_QUBITS = 16;

/**
 * Correlation length ξ from the connected ⟨ZᵢZⱼ⟩ correlator. Averages |C| over
 * pairs at each separation r to get a decay profile g(r), then fits
 * ln g(r) = −r/ξ + c. ξ is short in a gapped phase and diverges at a critical
 * point. Plots g(r) (log axis) with the exponential fit overlaid.
 * Statevector path, n ≤ 16, default-collapsed.
 */
export function CorrelationLengthPanel({ state }: Props) {
  return (
    <PanelShell id="correlation-length" title="Correlation length ξ" defaultCollapsed>
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
    if (n < 3 || n > MAX_QUBITS) return null;
    return correlationLength(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 3) return <div className="panel__placeholder">needs at least 3 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector correlator.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — correlator from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: CorrelationLengthResult }) {
  const { r: rs, g, xi, intercept, fitPoints } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  // Log-y axis: use ln g, floor at a small value.
  const lns = g.map((v) => (v > 1e-6 ? Math.log(v) : NaN));
  const finite = lns.filter((v) => Number.isFinite(v));
  const yMax = Math.max(...finite, intercept, -0.5);
  const yMin = Math.min(...finite, -8);
  const rMax = rs[rs.length - 1];
  const xOf = (rr: number) => PAD_L + (rr / rMax) * plotW;
  const yOf = (ln: number) => PAD_T + (1 - (ln - yMin) / (yMax - yMin || 1)) * plotH;
  const finiteRok = xi !== null && Number.isFinite(xi);
  return (
    <div className="corrlen__out">
      <div className="corrlen__stats">
        <span>ξ = <b>{finiteRok ? xi.toFixed(2) : "∞"}</b> sites</span>
        <span>{fitPoints} pts</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="corrlen__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="corrlen__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="corrlen__axis-line" />
        {finiteRok && (
          <line x1={xOf(rs[0])} y1={yOf(intercept - rs[0] / xi)} x2={xOf(rMax)} y2={yOf(intercept - rMax / xi)} className="corrlen__fit" />
        )}
        {g.map((v, i) =>
          Number.isFinite(lns[i]) ? <circle key={i} cx={xOf(rs[i])} cy={yOf(lns[i])} r={2.6} className="corrlen__dot"><title>r={rs[i]}, g={v.toExponential(2)}</title></circle> : null,
        )}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="corrlen__axis">ln g</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="corrlen__axis">separation r →</text>
      </svg>
      <div className="corrlen__legend">|⟨ZᵢZⱼ⟩_c| vs distance (log axis) · slope = −1/ξ</div>
    </div>
  );
}
