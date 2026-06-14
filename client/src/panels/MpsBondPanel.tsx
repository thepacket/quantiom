import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { mpsBondDimension, type MpsBondResult } from "../sim/mpsBondDimension";

type Props = { state: SimState };
const MAX_SIDE = 8;
const TARGETS = [0.1, 0.01, 0.001];

/**
 * MPS bond dimension & truncation — the bond dimension χ needed per contiguous
 * cut to represent the state as a matrix product state within a target
 * truncation error, plus the maximum χ over all cuts and the error-vs-χ curve
 * at the worst cut. A product state needs χ = 1; a volume-law state needs χ
 * growing exponentially with the cut size. Statevector path, smaller side ≤ 8,
 * default-collapsed.
 */
export function MpsBondPanel({ state }: Props) {
  return (
    <PanelShell id="mps-bond" title="MPS bond dimension" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [target, setTarget] = useState(0.01);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2) return null;
    return mpsBondDimension(data.state, n, target, MAX_SIDE);
  }, [collapsed, data, n, target]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector Schmidt spectrum.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — bond dimension is for a pure state.</div>;

  return (
    <div className="mps">
      <div className="mps__ctrl">
        <span className="mps__lbl">target ε:</span>
        {TARGETS.map((t) => (
          <button key={t} className={"mps__tbtn" + (t === target ? " mps__tbtn--on" : "")} onClick={() => setTarget(t)}>{t}</button>
        ))}
      </div>
      {result && <View r={result} />}
    </div>
  );
}

const W = 300;
const H = 110;
const PAD_L = 24;
const PAD_B = 18;

function View({ r }: { r: MpsBondResult }) {
  const { chi, maxChi, truncError } = r;
  const k = chi.length;
  const finite = chi.filter((c) => Number.isFinite(c));
  const top = Math.max(2, ...finite);
  const bw = Math.max(6, Math.floor((W - PAD_L) / Math.max(1, k)) - 3);
  return (
    <div className="mps__out">
      <div className="mps__stats">
        <span>max χ = <b>{maxChi}</b></span>
        <span>{finite.length}/{k} cuts</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mps__svg plot-fill" role="img">
        <line x1={PAD_L} y1={H - PAD_B} x2={W} y2={H - PAD_B} className="mps__axis-line" />
        {chi.map((c, i) =>
          Number.isFinite(c) ? (
            <g key={i}>
              <rect x={PAD_L + i * (bw + 3)} y={(H - PAD_B) - (c / top) * (H - PAD_B - 6)} width={bw} height={(c / top) * (H - PAD_B - 6)} className="mps__bar">
                <title>cut {i}: χ = {c}</title>
              </rect>
              <text x={PAD_L + i * (bw + 3) + bw / 2} y={H - 5} textAnchor="middle" className="mps__axis">{i}</text>
            </g>
          ) : null,
        )}
        <text x={PAD_L - 3} y={12} textAnchor="end" className="mps__axis">{top}</text>
      </svg>
      <div className="mps__legend">
        required χ per cut · worst-cut truncation error: {truncError.slice(0, 6).map((e, i) => `χ${i + 1}=${e.toExponential(0)}`).join(", ")}
      </div>
    </div>
  );
}
