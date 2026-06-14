import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { threeTangle, type ThreeTangleResult } from "../sim/threeTangle";

type Props = { state: SimState };

/**
 * Three-tangle (CKW residual) for a 3-qubit pure state: the one-tangle of the
 * focal qubit τ_{a(bc)} = 2(1 − Tr ρ_a²) split into the two pairwise squared
 * concurrences and the genuine tripartite residual τ₃ = τ_{a(bc)} − C²_{ab} −
 * C²_{ac}. τ₃ = 1 for GHZ, 0 for W — the clean GHZ-vs-W discriminator.
 * Statevector path, exactly 3 qubits, default-collapsed.
 */
export function ThreeTanglePanel({ state }: Props) {
  return (
    <PanelShell id="three-tangle" title="Three-tangle (monogamy)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [focal, setFocal] = useState(0);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy || n !== 3) return null;
    const others = [0, 1, 2].filter((q) => q !== focal);
    return threeTangle(data.state, 3, focal, others[0], others[1]);
  }, [collapsed, data, n, focal]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n !== 3) return <div className="panel__notice">The three-tangle is defined for a pure 3-qubit state. This circuit has {n} qubits.</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrices.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — the three-tangle is a pure-state measure.</div>;
  if (!result) return null;

  return (
    <div className="tang3">
      <div className="tang3__ctrl">
        <span>focal qubit:</span>
        {[0, 1, 2].map((q) => (
          <button key={q} className={"tang3__qbtn" + (q === focal ? " tang3__qbtn--on" : "")} onClick={() => setFocal(q)}>q{q}</button>
        ))}
      </div>
      <View r={result} />
    </div>
  );
}

const W = 300;
const BAR_H = 26;

function View({ r }: { r: ThreeTangleResult }) {
  const { oneTangle, cab2, cac2, tau3, focal } = r;
  const others = [0, 1, 2].filter((q) => q !== focal);
  const total = Math.max(oneTangle, 1e-9);
  const seg = (v: number) => (v / total) * (W - 4);
  const x1 = seg(cab2);
  const x2 = seg(cac2);
  const x3 = seg(tau3);
  return (
    <div className="tang3__out">
      <div className="tang3__stats">
        <span>τ<sub>{focal}(bc)</sub> = <b>{oneTangle.toFixed(3)}</b></span>
        <span>τ₃ = <b>{tau3.toFixed(3)}</b></span>
        <span className="tang3__tag">{tau3 > 0.5 ? "GHZ-like" : tau3 < 0.05 && oneTangle > 0.1 ? "W-like" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${BAR_H}`} className="tang3__svg plot-fill" role="img">
        <rect x={2} y={4} width={x1} height={BAR_H - 8} className="tang3__seg tang3__seg--ab"><title>C²(q{focal},q{others[0]}) = {cab2.toFixed(3)}</title></rect>
        <rect x={2 + x1} y={4} width={x2} height={BAR_H - 8} className="tang3__seg tang3__seg--ac"><title>C²(q{focal},q{others[1]}) = {cac2.toFixed(3)}</title></rect>
        <rect x={2 + x1 + x2} y={4} width={x3} height={BAR_H - 8} className="tang3__seg tang3__seg--res"><title>residual τ₃ = {tau3.toFixed(3)}</title></rect>
      </svg>
      <div className="tang3__legend">
        <span><span className="tang3__sw tang3__sw--ab" /> C²(q{focal},q{others[0]})</span>
        <span><span className="tang3__sw tang3__sw--ac" /> C²(q{focal},q{others[1]})</span>
        <span><span className="tang3__sw tang3__sw--res" /> residual τ₃</span>
      </div>
    </div>
  );
}
