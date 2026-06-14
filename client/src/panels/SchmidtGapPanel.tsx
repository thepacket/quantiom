import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { schmidtGap, type SchmidtGapResult } from "../sim/schmidtGap";

type Props = { state: SimState };
const MAX_SIDE = 8;

/**
 * Schmidt gap Δλ(k) = λ₁ − λ₂ across every contiguous cut — the gap between
 * the two largest squared Schmidt coefficients of ρ_{[0..k]}. An order
 * parameter for symmetry-protected topological transitions: open in a gapped
 * phase, it **closes** at criticality where the entanglement spectrum becomes
 * degenerate. Statevector path, smaller side ≤ 8, default-collapsed.
 */
export function SchmidtGapPanel({ state }: Props) {
  return (
    <PanelShell id="schmidt-gap" title="Schmidt gap" defaultCollapsed>
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
    if (n < 2) return null;
    return schmidtGap(data.state, n, MAX_SIDE);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrix.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — Schmidt gap from a single trajectory isn't meaningful.</div>;
  if (!result) return null;

  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: SchmidtGapResult }) {
  const { gap } = r;
  const k = gap.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const finite = gap.filter((v) => Number.isFinite(v));
  const max = Math.max(0.01, ...finite);
  const minGap = finite.length ? Math.min(...finite) : 0;
  const xOf = (i: number) => PAD_L + (k <= 1 ? plotW / 2 : (i / (k - 1)) * plotW);
  const yOf = (v: number) => PAD_T + (1 - v / max) * plotH;
  const bw = Math.max(4, Math.floor(plotW / Math.max(1, k)) - 2);
  return (
    <div className="sgap__out">
      <div className="sgap__stats">
        <span>min Δλ = <b>{minGap.toFixed(3)}</b></span>
        <span className="sgap__tag">{minGap < 0.05 ? "near-degenerate (critical?)" : "gapped"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sgap__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="sgap__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="sgap__axis-line" />
        {gap.map((v, i) =>
          Number.isFinite(v) ? (
            <rect key={i} x={xOf(i) - bw / 2} y={yOf(v)} width={bw} height={H - PAD_B - yOf(v)} className="sgap__bar">
              <title>cut {i}: Δλ = {v.toFixed(4)}</title>
            </rect>
          ) : null,
        )}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="sgap__axis">{max.toFixed(2)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="sgap__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="sgap__axis">cut position →</text>
      </svg>
      <div className="sgap__legend">λ₁ − λ₂ of ρ_A per cut · closes (→ 0) at a topological critical point</div>
    </div>
  );
}
