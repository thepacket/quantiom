import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { lyapunovExponent, type LyapunovResult } from "../sim/lyapunov";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 6;

/**
 * Quantum Lyapunov exponent λ_L — fits the early-time exponential growth of
 * the OTOC, C(t) ∝ e^{λ_L t}, on a log axis (the temporal companion to the
 * spatial butterfly velocity). The growth window between a small floor and the
 * approach to saturation is used for the fit. Statevector path, n ≤ 6,
 * default-collapsed.
 */
export function LyapunovPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="lyapunov" title="Lyapunov exponent (OTOC)" defaultCollapsed>
      <Body state={state} circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_QUBITS) return null;
    return lyapunovExponent(circuit, paramValues, customGates, 0, undefined, 48, MAX_QUBITS);
  }, [collapsed, data, n, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — the OTOC needs the statevector path.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — use the exact statevector for the OTOC.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 130;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: LyapunovResult }) {
  const { ts, lnC, lyapunov, intercept } = r;
  const finite = lnC.filter((v) => Number.isFinite(v));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = finite.length ? Math.max(...finite) : 0;
  const yMin = finite.length ? Math.min(...finite) : -6;
  const tMax = ts[ts.length - 1];
  const xOf = (t: number) => PAD_L + (t / tMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  const okFit = Number.isFinite(lyapunov);
  return (
    <div className="lyap__out">
      <div className="lyap__stats">
        <span>λ_L = <b>{okFit ? lyapunov.toFixed(3) : "—"}</b></span>
        <span className="lyap__tag">{okFit ? (lyapunov > 0.05 ? "exponential growth" : "no clear growth") : "no growth window"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lyap__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="lyap__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="lyap__axis-line" />
        {okFit && <line x1={xOf(0)} y1={yOf(intercept)} x2={xOf(tMax)} y2={yOf(intercept + lyapunov * tMax)} className="lyap__fit" />}
        {lnC.map((v, k) => (Number.isFinite(v) ? <circle key={k} cx={xOf(ts[k])} cy={yOf(v)} r={2.2} className="lyap__dot"><title>t={ts[k].toFixed(2)}, ln C={v.toFixed(2)}</title></circle> : null))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="lyap__axis">ln C</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="lyap__axis">t → (growth window)</text>
      </svg>
      <div className="lyap__legend">ln C(t) in the early-time window · slope = λ_L (OTOC exponential growth rate)</div>
    </div>
  );
}
