import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { tripartiteInformation, type TripartiteResult } from "../sim/tripartiteInfo";

type Props = { state: SimState };
const MAX_QUBITS = 14;

/**
 * Tripartite information I₃(A:B:C) = I(A:B) + I(A:C) − I(A:BC) for three chosen
 * single qubits (the rest of the register is the implicit fourth region). I₃
 * goes strongly negative under scrambling — information about A delocalises
 * into the joint BC rather than B or C alone — and is a witness of topological
 * order. Statevector path, n ≥ 4, default-collapsed.
 */
export function TripartiteInfoPanel({ state }: Props) {
  return (
    <PanelShell id="tripartite-info" title="Tripartite information I₃" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [abc, setAbc] = useState<[number, number, number]>([0, 1, 2]);

  // Keep the three qubits valid and distinct as n changes.
  useEffect(() => {
    setAbc((prev) => {
      const pick = (i: number, fallback: number) => (prev[i] < n ? prev[i] : fallback);
      const a = pick(0, 0);
      const b = pick(1, Math.min(1, n - 1));
      const c = pick(2, Math.min(2, n - 1));
      return [a, b, c];
    });
  }, [n]);

  const distinct = abc[0] !== abc[1] && abc[0] !== abc[2] && abc[1] !== abc[2];

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 4 || n > MAX_QUBITS || !distinct) return null;
    return tripartiteInformation(data.state, n, abc[0], abc[1], abc[2], MAX_QUBITS);
  }, [collapsed, data, n, abc, distinct]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 4) return <div className="panel__placeholder">needs at least 4 qubits (three regions + a remainder)</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — entropies need the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — entropy from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;

  const sel = (idx: number, label: string) => (
    <label className="tri__sel">
      {label}
      <select value={abc[idx]} onChange={(e) => setAbc((p) => { const next = [...p] as [number, number, number]; next[idx] = Number(e.target.value); return next; })}>
        {Array.from({ length: n }, (_, q) => <option key={q} value={q}>q{q}</option>)}
      </select>
    </label>
  );

  return (
    <div className="tri">
      <div className="tri__pick">{sel(0, "A")}{sel(1, "B")}{sel(2, "C")}</div>
      {!distinct ? (
        <div className="panel__notice">A, B, C must be three distinct qubits.</div>
      ) : result ? (
        <View r={result} />
      ) : null}
    </div>
  );
}

function View({ r }: { r: TripartiteResult }) {
  const bars = [
    { label: "I(A:B)", v: r.iAB },
    { label: "I(A:C)", v: r.iAC },
    { label: "I(A:BC)", v: r.iABC },
  ];
  const max = Math.max(1e-9, ...bars.map((b) => b.v));
  return (
    <div className="tri__out">
      <div className={"tri__hero " + (r.i3 < -1e-6 ? "tri__hero--neg" : "tri__hero--pos")}>
        I₃ = <b>{r.i3.toFixed(4)}</b> bit
        <span className="tri__tag">{r.i3 < -1e-6 ? "scrambling (delocalised)" : "non-scrambling"}</span>
      </div>
      <div className="tri__bars">
        {bars.map((b) => (
          <div key={b.label} className="tri__row">
            <span className="tri__lbl">{b.label}</span>
            <span className="tri__track"><span className="tri__fill" style={{ width: `${(b.v / max) * 100}%` }} /></span>
            <span className="tri__val">{b.v.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="tri__legend">I₃ &lt; 0 ⇒ information about A lives in the joint BC, not in B or C individually.</div>
    </div>
  );
}
