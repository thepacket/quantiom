import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { ptMoments, type PtMomentsResult } from "../sim/ptMoments";

type Props = { state: SimState };
const MAX_QUBITS = 6;

/**
 * Partial-transpose moments p_n = Tr[(ρ^{T_A})ⁿ] across a cut, and the p₃-PPT
 * entanglement criterion (p₃ < p₂² ⇒ entangled). These are the moments a
 * randomized-measurement / classical-shadow protocol estimates directly, so
 * they are the practical entanglement probe for noisy states. Computed exactly
 * from the pure-state partial-transpose eigenvalues. Statevector path, n ≤ 6,
 * default-collapsed.
 */
export function PtMomentsPanel({ state }: Props) {
  return (
    <PanelShell id="pt-moments" title="PT moments (p₃ criterion)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [inA, setInA] = useState<boolean[]>([]);

  useEffect(() => {
    setInA((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<boolean>(n).fill(false);
      for (let i = 0; i < Math.floor(n / 2); i++) next[i] = true;
      return next;
    });
  }, [n]);

  const subsetA = useMemo(() => inA.flatMap((on, i) => (on ? [i] : [])), [inA]);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_QUBITS || subsetA.length === 0 || subsetA.length >= n) return null;
    return ptMoments(data.state, n, subsetA, 6, MAX_QUBITS);
  }, [collapsed, data, n, subsetA]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs the statevector density matrix.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — single-trajectory PT isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS} (builds the full ρ).</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="ptm">
      <div className="ptm__cut">
        <span className="ptm__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"ptm__qubit" + (inA[q] ? " ptm__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {subsetA.length === 0 || subsetA.length >= n ? <div className="panel__placeholder">select a proper subset.</div> : result ? <View r={result} /> : null}
    </div>
  );
}

const W = 300;
const H = 100;

function View({ r }: { r: PtMomentsResult }) {
  const { moments, p2, p3, entangledByP3, logNegativity } = r;
  const max = Math.max(...moments.map((m) => Math.abs(m)), 1e-9);
  const bw = Math.max(10, Math.floor((W - 4) / moments.length) - 6);
  return (
    <div className="ptm__out">
      <div className="ptm__stats">
        <span>p₂ = <b>{p2.toFixed(4)}</b></span>
        <span>p₃ = <b>{p3.toFixed(4)}</b></span>
        <span className={"ptm__tag " + (entangledByP3 ? "ptm__tag--ent" : "")}>{entangledByP3 ? "p₃ < p₂² ⇒ entangled" : "p₃ criterion: not flagged"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ptm__svg plot-fill" role="img">
        <line x1={0} y1={H - 16} x2={W} y2={H - 16} className="ptm__axis-line" />
        {moments.map((m, i) => {
          const h = (Math.abs(m) / max) * (H - 24);
          const x = 4 + i * (bw + 6);
          return (
            <g key={i}>
              <rect x={x} y={H - 16 - h} width={bw} height={h} className="ptm__bar"><title>p{i + 1} = {m.toFixed(5)}</title></rect>
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="ptm__axis">p{i + 1}</text>
            </g>
          );
        })}
      </svg>
      <div className="ptm__legend">p_n = Tr[(ρ^{"{T_A}"})ⁿ] · E_N = {logNegativity.toFixed(3)} · the p₃ test detects entanglement from low moments</div>
    </div>
  );
}
