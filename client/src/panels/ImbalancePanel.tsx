import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { imbalanceSweep, type ImbalanceResult } from "../sim/imbalance";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 14;

/**
 * Density / charge-density-wave imbalance I(t) = (1/n) Σ_i (−1)^i ⟨Z_i⟩(t) over
 * the `t` clock — the canonical MBL vs thermalization diagnostic. Thermalising
 * dynamics relax I → 0 (the pattern washes out); an MBL phase saturates to a
 * non-zero plateau (memory retained). Statevector path, n ≤ 14,
 * default-collapsed.
 */
export function ImbalancePanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="imbalance" title="Density imbalance I(t)" defaultCollapsed>
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
    if (n < 1 || n > MAX_QUBITS) return null;
    return imbalanceSweep(circuit, paramValues, customGates, 64, MAX_QUBITS);
  }, [collapsed, data, n, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — the imbalance sweep needs per-qubit ⟨Z⟩ from the statevector path.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — a single-trajectory sweep isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Plot r={result} />;
}

const W = 300;
const H = 130;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: ImbalanceResult }) {
  const { ts, imbalance, plateau } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (k: number) => PAD_L + (k / (ts.length - 1)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v + 1) / 2) * plotH; // [-1,1] → top..bottom
  const path = imbalance.map((v, k) => `${xOf(k).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");

  return (
    <div className="imb__out">
      <div className="imb__stats">
        <span>I(0) = <b>{imbalance[0].toFixed(3)}</b></span>
        <span>plateau ⟨|I|⟩ = <b>{plateau.toFixed(3)}</b></span>
        <span className="imb__tag">{plateau > 0.15 ? "memory retained (MBL-like)" : "relaxes (thermal)"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="imb__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="imb__axis-line" />
        <line x1={PAD_L} y1={yOf(0)} x2={W - PAD_R} y2={yOf(0)} className="imb__zero" />
        <polyline points={path} className="imb__curve" />
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="imb__axis">+1</text>
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="imb__axis">0</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="imb__axis">−1</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="imb__axis">t → (one period)</text>
      </svg>
      <div className="imb__legend">staggered ⟨Z⟩ imbalance · non-zero plateau ⇒ retained density-wave memory</div>
    </div>
  );
}
