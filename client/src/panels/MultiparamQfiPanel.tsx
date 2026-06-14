import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { multiparameterQFI, type MultiQfiResult } from "../sim/multiparamQfi";

type Props = { state: SimState };
const MAX_QUBITS = 14;
const AXES = ["Jx", "Jy", "Jz"];

/**
 * Multiparameter quantum Fisher information matrix F_{ab} = 4·Cov(J_a, J_b)
 * over the collective-spin generators {Jx, Jy, Jz}, as a 3×3 heatmap. Its
 * largest eigenvalue is the best single-axis QFI (what the scalar QFI panel
 * reports for the optimal direction); det F bounds the joint estimation of
 * several phases (the multiparameter Cramér–Rao bound). Statevector path,
 * n ≤ 14, default-collapsed.
 */
export function MultiparamQfiPanel({ state }: Props) {
  return (
    <PanelShell id="multiparam-qfi" title="QFI matrix (multiparameter)" defaultCollapsed>
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
    if (n < 1 || n > MAX_QUBITS) return null;
    return multiparameterQFI(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — the generator covariance needs the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — pure-state QFI; use the noisy expectation tools instead.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <View r={result} />;
}

function View({ r }: { r: MultiQfiResult }) {
  const { F, eigenvalues, maxEig, det } = r;
  let maxAbs = 1e-9;
  for (const row of F) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
  return (
    <div className="mqfi">
      <div className="mqfi__stats">
        <span>max eig = <b>{maxEig.toFixed(3)}</b></span>
        <span>det F = <b>{det.toFixed(3)}</b></span>
      </div>
      <div className="mqfi__grid" style={{ gridTemplateColumns: "auto repeat(3, 1fr)" }}>
        <div className="mqfi__corner" />
        {AXES.map((a) => <div key={a} className="mqfi__hdr">{a}</div>)}
        {F.map((row, i) => (
          <Row key={i} label={AXES[i]} row={row} maxAbs={maxAbs} />
        ))}
      </div>
      <div className="mqfi__legend">F_ab = 4·Cov(J_a,J_b) · eig ∈ [{eigenvalues[0].toFixed(2)}, {maxEig.toFixed(2)}] · max eig &gt; N witnesses entanglement</div>
    </div>
  );
}

function Row({ label, row, maxAbs }: { label: string; row: number[]; maxAbs: number }) {
  return (
    <>
      <div className="mqfi__hdr mqfi__hdr--row">{label}</div>
      {row.map((v, j) => {
        const t = Math.abs(v) / maxAbs;
        const bg = v >= 0
          ? `rgba(110, 177, 255, ${(0.1 + 0.8 * t).toFixed(3)})`
          : `rgba(255, 142, 111, ${(0.1 + 0.8 * t).toFixed(3)})`;
        return (
          <div key={j} className="mqfi__cell" style={{ background: bg }} title={`F = ${v.toFixed(4)}`}>
            {Math.abs(v) < 0.005 ? "0" : v.toFixed(2)}
          </div>
        );
      })}
    </>
  );
}
