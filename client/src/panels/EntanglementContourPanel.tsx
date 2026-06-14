import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementContour, type ContourResult } from "../sim/entanglementContour";

type Props = { state: SimState };
const MAX_REGION = 7;

/**
 * Entanglement contour — the per-site incremental entanglement entropy
 * s(j) = S([0..j]) − S([0..j−1]) across a contiguous region [0..m−1]. Bars
 * sum to S(A) and show where the region's entanglement sits: flat = volume
 * law, boundary-peaked = area law, a negative bar = a site whose inclusion
 * lowers the entropy. Statevector path, region ≤ 7, default-collapsed.
 */
export function EntanglementContourPanel({ state }: Props) {
  return (
    <PanelShell id="entanglement-contour" title="Entanglement contour" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [region, setRegion] = useState(1);

  useEffect(() => {
    setRegion(Math.min(MAX_REGION, Math.max(1, Math.floor(n / 2))));
  }, [n]);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || region < 1 || region >= n) return null;
    return entanglementContour(data.state, n, Math.min(region, MAX_REGION));
  }, [collapsed, data, n, region]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — entropies need the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — entropy from a single trajectory isn't meaningful.</div>;

  const maxRegion = Math.min(MAX_REGION, n - 1);
  return (
    <div className="econt">
      <div className="econt__ctrl">
        <span>region A = [0 … {region - 1}]</span>
        <input type="range" min={1} max={maxRegion} value={Math.min(region, maxRegion)} onChange={(e) => setRegion(Number(e.target.value))} />
      </div>
      {result ? <Plot r={result} /> : region > maxRegion ? <div className="panel__notice">region capped at {maxRegion}.</div> : null}
    </div>
  );
}

const W = 300;
const H = 110;

function Plot({ r }: { r: ContourResult }) {
  const { contour, total } = r;
  const maxAbs = Math.max(1e-9, ...contour.map((v) => Math.abs(v)));
  const bw = Math.max(6, Math.floor((W - 4) / contour.length) - 3);
  const midY = H - 18;
  const scale = (midY - 6) / maxAbs;
  return (
    <div className="econt__out">
      <div className="econt__stats">
        <span>S(A) = <b>{total.toFixed(3)}</b> bit</span>
        <span>{contour.length} sites</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="econt__svg plot-fill" role="img">
        <line x1={0} y1={midY} x2={W} y2={midY} className="econt__axis-line" />
        {contour.map((v, j) => {
          const h = Math.abs(v) * scale;
          const x = 2 + j * (bw + 3);
          const y = v >= 0 ? midY - h : midY;
          return (
            <g key={j}>
              <rect x={x} y={y} width={bw} height={h} className={v >= 0 ? "econt__bar" : "econt__bar econt__bar--neg"}>
                <title>s({j}) = {v.toFixed(4)}</title>
              </rect>
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="econt__axis">{j}</text>
            </g>
          );
        })}
      </svg>
      <div className="econt__legend">incremental S added per site · Σ = S(A) · negative ⇒ site lowers the entropy</div>
    </div>
  );
}
