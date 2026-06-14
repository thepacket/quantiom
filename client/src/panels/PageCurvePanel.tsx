import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { pageCurve, type PageCurveResult } from "../sim/pageCurve";

type Props = { state: SimState };
const MAX_QUBITS = 14;

/**
 * Page curve — the entanglement-entropy profile S(ρ_A) across every contiguous
 * cut, with the analytic Haar-random Page value overlaid (and the maximal
 * min(|A|,|B|) bound). A scrambled / volume-law state hugs the Page arch; a
 * gapped ground state stays flat (area law); a product state is zero.
 * Statevector path, n ≤ 14, default-collapsed.
 */
export function PageCurvePanel({ state }: Props) {
  return (
    <PanelShell id="page-curve" title="Page curve" defaultCollapsed>
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
    return pageCurve(data.state, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — entropies need the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — entropy from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — the Page curve is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Plot r={result} />;
}

const W = 300;
const H = 140;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: PageCurveResult }) {
  const { entropy, page, maxEntropy } = r;
  const k = entropy.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(1, ...maxEntropy);
  const xOf = (i: number) => PAD_L + (k <= 1 ? plotW / 2 : (i / (k - 1)) * plotW);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;

  const line = (vals: number[]) =>
    vals
      .map((v, i) => (Number.isFinite(v) ? `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}` : null))
      .filter(Boolean)
      .join(" ");

  // Mean deviation of S from the Page value, where defined.
  let dev = 0;
  let cnt = 0;
  for (let i = 0; i < k; i++) {
    if (Number.isFinite(entropy[i])) { dev += Math.abs(entropy[i] - page[i]); cnt++; }
  }
  const meanDev = cnt > 0 ? dev / cnt : NaN;

  return (
    <div className="page__out">
      <div className="page__stats">
        <span>cuts <b>{k}</b></span>
        <span>mean |S − S<sub>Page</sub>| = <b>{Number.isFinite(meanDev) ? meanDev.toFixed(3) : "—"}</b> bit</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="page__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="page__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="page__axis-line" />
        <polyline points={line(maxEntropy)} className="page__max" />
        <polyline points={line(page)} className="page__page" />
        <polyline points={line(entropy)} className="page__entropy" />
        {entropy.map((v, i) =>
          Number.isFinite(v) ? <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.2} className="page__dot" /> : null,
        )}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="page__axis">{yMax.toFixed(0)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="page__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="page__axis">cut position →</text>
      </svg>
      <div className="page__legend">
        <span><span className="page__swatch page__swatch--entropy" /> S(ρ_A)</span>
        <span><span className="page__swatch page__swatch--page" /> Page (Haar)</span>
        <span><span className="page__swatch page__swatch--max" /> max min(|A|,|B|)</span>
      </div>
    </div>
  );
}
