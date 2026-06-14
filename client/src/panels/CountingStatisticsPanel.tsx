import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { countingStatistics, type CountingResult } from "../sim/countingStatistics";

type Props = { state: SimState };
const MAX_QUBITS = 18;

/**
 * Full counting statistics — the probability distribution P(m) of the
 * excitation number N_A = Σ_{i∈A} |1⟩⟨1| in a chosen subregion A. Its mean is
 * the filling; its **variance** is the bipartite charge fluctuation, a cheap
 * measurable proxy that grows with entanglement for U(1)-symmetric states.
 * Statevector path, default-collapsed.
 */
export function CountingStatisticsPanel({ state }: Props) {
  return (
    <PanelShell id="counting-statistics" title="Counting statistics" defaultCollapsed>
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
      for (let i = 0; i < Math.max(1, Math.floor(n / 2)); i++) next[i] = true;
      return next;
    });
  }, [n]);

  const region = useMemo(() => inA.flatMap((on, i) => (on ? [i] : [])), [inA]);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (region.length === 0 || n > MAX_QUBITS) return null;
    return countingStatistics(data.state, n, region, MAX_QUBITS);
  }, [collapsed, data, n, region]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — counting statistics need the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — distribution from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));

  return (
    <div className="fcs">
      <div className="fcs__cut">
        <span className="fcs__cut-label">region A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"fcs__qubit" + (inA[q] ? " fcs__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />
            q{q}
          </label>
        ))}
      </div>
      {region.length === 0 ? (
        <div className="panel__placeholder">select at least one qubit.</div>
      ) : result ? (
        <Dist r={result} />
      ) : null}
    </div>
  );
}

const W = 300;
const H = 110;

function Dist({ r }: { r: CountingResult }) {
  const { p, mean, variance, size } = r;
  const max = Math.max(1e-9, ...p);
  const bw = Math.max(4, Math.floor((W - 2) / p.length) - 2);
  return (
    <div className="fcs__out">
      <div className="fcs__stats">
        <span>⟨N⟩ = <b>{mean.toFixed(3)}</b></span>
        <span>Var = <b>{variance.toFixed(3)}</b></span>
        <span>|A| = {size}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="fcs__svg plot-fill" role="img">
        <line x1={0} y1={H - 14} x2={W} y2={H - 14} className="fcs__axis-line" />
        {p.map((v, m) => {
          const h = (v / max) * (H - 22);
          const x = 1 + m * (bw + 2);
          return (
            <g key={m}>
              <rect x={x} y={H - 14 - h} width={bw} height={h} className="fcs__bar">
                <title>P(N={m}) = {v.toFixed(4)}</title>
              </rect>
              <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="fcs__axis">{m}</text>
            </g>
          );
        })}
      </svg>
      <div className="fcs__legend">P(N<sub>A</sub> = m) · variance = bipartite charge fluctuation (entanglement proxy)</div>
    </div>
  );
}
