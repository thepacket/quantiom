import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { negativityDynamics, type NegativityDynamicsResult } from "../sim/negativityDynamics";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 12;
const MAX_SIDE = 6;

/**
 * Negativity dynamics — the logarithmic negativity across a chosen cut over
 * one period of the `t` clock, read cheaply from the Schmidt coefficients
 * (E_N = 2 log₂ Σ√λ). Shows entanglement growth, oscillation, and sudden
 * death/revival. Statevector path, n ≤ 12, smaller cut side ≤ 6,
 * default-collapsed.
 */
export function NegativityDynamicsPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="negativity-dynamics" title="Negativity dynamics E_N(t)" defaultCollapsed>
      <Body state={state} circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
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
  const smallSide = Math.min(subsetA.length, n - subsetA.length);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_QUBITS || subsetA.length === 0 || subsetA.length >= n || smallSide > MAX_SIDE) return null;
    return negativityDynamics(circuit, paramValues, customGates, subsetA, 64, MAX_QUBITS, MAX_SIDE);
  }, [collapsed, data, n, subsetA, smallSide, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs statevector Schmidt coefficients.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — single-trajectory negativity isn't meaningful.</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="negdyn">
      <div className="negdyn__cut">
        <span className="negdyn__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"negdyn__qubit" + (inA[q] ? " negdyn__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {smallSide > MAX_SIDE ? (
        <div className="panel__notice">smaller side {smallSide} qubits — capped at {MAX_SIDE}.</div>
      ) : result ? (
        <Plot r={result} />
      ) : (
        <div className="panel__placeholder">select a proper subset.</div>
      )}
    </div>
  );
}

const W = 300;
const H = 120;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: NegativityDynamicsResult }) {
  const { ts, logNeg, maxLogNeg } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(0.5, maxLogNeg);
  const xOf = (t: number) => PAD_L + (t / (2 * Math.PI)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const path = logNeg.map((v, k) => (Number.isFinite(v) ? `${xOf(ts[k]).toFixed(1)},${yOf(v).toFixed(1)}` : "")).filter(Boolean).join(" ");
  return (
    <div className="negdyn__out">
      <div className="negdyn__stats">
        <span>max E_N = <b>{maxLogNeg.toFixed(3)}</b></span>
        <span>E_N(0) = <b>{logNeg[0].toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="negdyn__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="negdyn__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="negdyn__axis-line" />
        <polyline points={path} className="negdyn__curve" />
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="negdyn__axis">{yMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="negdyn__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="negdyn__axis">t → (one period)</text>
      </svg>
      <div className="negdyn__legend">log-negativity across the cut over t · dips to 0 = entanglement sudden death</div>
    </div>
  );
}
