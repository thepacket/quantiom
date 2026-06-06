import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { collectiveSpinGenerator, quantumFisherPure, type QfiResult } from "../sim/qfi";

type Props = { state: SimState };
type Axis = "X" | "Y" | "Z";

const MAX_QUBITS = 14;

/**
 * Quantum Fisher Information F_Q[ψ, J_α] = 4 Var(J_α) for the collective-spin
 * generator J_α = ½ Σ σ_α — the phase-estimation sensitivity and a
 * multipartite-entanglement witness. F_Q/N ≤ 1 for separable states (standard
 * quantum limit); F_Q/N > 1 witnesses metrologically useful entanglement; the
 * Heisenberg limit is F_Q = N² (saturated by GHZ along the right axis).
 *
 * Pure-statevector path only (QFI = 4 Var for pure states); n ≤ 14, default-
 * collapsed.
 */
export function QfiPanel({ state }: Props) {
  return (
    <PanelShell id="qfi" title="Quantum Fisher info" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [axis, setAxis] = useState<Axis>("Z");

  const result = useMemo(() => {
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return quantumFisherPure(data.state, n, collectiveSpinGenerator(n, axis));
  }, [collapsed, data, n, axis]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the statevector QFI.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — this QFI is the pure-state 4·Var(J); disable noise to read it.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — QFI is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return (
    <div className="qfi">
      <div className="qfi__axes">
        <span className="qfi__label">generator J<sub>α</sub> = ½ Σ σ<sub>α</sub></span>
        {(["X", "Y", "Z"] as Axis[]).map((a) => (
          <button
            key={a}
            className={`qfi__axis${axis === a ? " qfi__axis--on" : ""}`}
            onClick={() => setAxis(a)}
          >
            J{a.toLowerCase()}
          </button>
        ))}
      </div>
      <View r={result} />
    </div>
  );
}

const W = 300;
const H = 30;
const PAD = 4;

function View({ r }: { r: QfiResult }) {
  const plotW = W - 2 * PAD;
  // Linear axis from 0 to the Heisenberg limit N².
  const xOf = (v: number) => PAD + (v / r.heisenberg) * plotW;
  const sqlX = xOf(r.sql);
  const fqX = xOf(r.qfi);

  return (
    <div className="qfi__out">
      <div className="qfi__stats">
        <span>F<sub>Q</sub> = <b>{r.qfi.toFixed(3)}</b></span>
        <span>F<sub>Q</sub>/N = <b>{r.qfiDensity.toFixed(3)}</b></span>
        <span className={r.witnessesEntanglement ? "qfi__verdict qfi__verdict--ent" : "qfi__verdict"}>
          {r.witnessesEntanglement ? "entangled & useful (F_Q > N)" : "no metrological gain"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="qfi__svg plot-fill" role="img">
        {/* track 0 … N² */}
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="qfi__track" />
        {/* SQL region shaded 0 … N */}
        <rect x={PAD} y={H / 2 - 4} width={Math.max(0, sqlX - PAD)} height={8} className="qfi__sql-band" />
        {/* SQL marker at N */}
        <line x1={sqlX} y1={H / 2 - 8} x2={sqlX} y2={H / 2 + 8} className="qfi__sql" />
        {/* Heisenberg marker at N² */}
        <line x1={W - PAD} y1={H / 2 - 8} x2={W - PAD} y2={H / 2 + 8} className="qfi__heis" />
        {/* F_Q fill + tip */}
        <line x1={PAD} y1={H / 2} x2={Math.min(fqX, W - PAD)} y2={H / 2} className="qfi__fill" />
        <circle cx={Math.min(fqX, W - PAD)} cy={H / 2} r={3.2} className="qfi__dot" />
      </svg>
      <div className="qfi__legend">
        <span>SQL = {r.sql}</span>
        <span>Heisenberg = {r.heisenberg}</span>
        <span>⟨J⟩ = {r.expG.toFixed(3)} · Var = {r.variance.toFixed(3)}</span>
      </div>
    </div>
  );
}
