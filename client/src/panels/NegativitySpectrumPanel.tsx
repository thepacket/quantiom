import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { negativitySpectrum, type NegativitySpectrumResult } from "../sim/negativitySpectrum";

type Props = { state: SimState };
const MAX_QUBITS = 6;

/**
 * Negativity spectrum — the eigenvalues of the partial transpose ρ^{T_A}
 * across a chosen cut, drawn as a sorted bar chart. Negative eigenvalues are
 * the entanglement signal: 𝒩 = Σ|λ₋| and E_N = log₂(2𝒩+1). Distinct from the
 * pairwise Negativity panel (one scalar per pair) — this resolves an
 * arbitrary bipartition. Statevector path, n ≤ 6, default-collapsed.
 */
export function NegativitySpectrumPanel({ state }: Props) {
  return (
    <PanelShell id="negativity-spectrum" title="Negativity spectrum" defaultCollapsed>
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
    return negativitySpectrum(data.state, n, subsetA, MAX_QUBITS);
  }, [collapsed, data, n, subsetA]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector density matrix.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — single-trajectory PT isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS} (builds the full ρ).</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="negsp">
      <div className="negsp__cut">
        <span className="negsp__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"negsp__qubit" + (inA[q] ? " negsp__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {subsetA.length === 0 || subsetA.length >= n ? (
        <div className="panel__placeholder">select a proper subset.</div>
      ) : result ? (
        <Plot r={result} />
      ) : null}
    </div>
  );
}

const W = 300;
const H = 110;

function Plot({ r }: { r: NegativitySpectrumResult }) {
  const { eigenvalues, negativity, logNegativity } = r;
  const max = Math.max(...eigenvalues.map((e) => Math.abs(e)), 1e-9);
  const bw = Math.max(1.5, (W - 4) / eigenvalues.length - 0.5);
  const midY = H / 2;
  const scale = (H / 2 - 8) / max;
  return (
    <div className="negsp__out">
      <div className="negsp__stats">
        <span>𝒩 = <b>{negativity.toFixed(4)}</b></span>
        <span>E_N = <b>{logNegativity.toFixed(4)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="negsp__svg plot-fill" role="img">
        <line x1={0} y1={midY} x2={W} y2={midY} className="negsp__axis-line" />
        {eigenvalues.map((e, i) => {
          const h = Math.abs(e) * scale;
          const x = 2 + i * (bw + 0.5);
          const y = e >= 0 ? midY - h : midY;
          return <rect key={i} x={x} y={y} width={bw} height={h} className={e < -1e-9 ? "negsp__bar negsp__bar--neg" : "negsp__bar"}><title>λ = {e.toFixed(4)}</title></rect>;
        })}
      </svg>
      <div className="negsp__legend">eigenvalues of ρ^{"{T_A}"} (sorted) · negative (orange) ⇒ entangled across the cut</div>
    </div>
  );
}
