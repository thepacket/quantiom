import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementVelocity, type EntVelocityResult } from "../sim/entanglementVelocity";
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

/**
 * Entanglement growth velocity — the half-chain entanglement entropy S(t) over
 * the `t` clock and the maximum slope dS/dt (the entanglement velocity v_E of
 * the "entanglement tsunami" after a quench). Statevector path, n ≤ 12,
 * half-cut side ≤ 6, default-collapsed.
 */
export function EntanglementVelocityPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="entanglement-velocity" title="Entanglement velocity dS/dt" defaultCollapsed>
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
    return entanglementVelocity(circuit, paramValues, customGates, 48, MAX_QUBITS, 6);
  }, [collapsed, data, n, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrix.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — single-trajectory entropy isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return <div className="panel__notice">half-cut too large to diagonalise (cap 6 per side).</div>;
  return <Plot r={result} />;
}

const W = 300;
const H = 130;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: EntVelocityResult }) {
  const { ts, entropy, velocity, velocityAt, maxEntropy } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(0.5, maxEntropy);
  const xOf = (t: number) => PAD_L + (t / (2 * Math.PI)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const path = entropy.map((v, k) => (Number.isFinite(v) ? `${xOf(ts[k]).toFixed(1)},${yOf(v).toFixed(1)}` : "")).filter(Boolean).join(" ");
  // Tangent line at the max-slope point.
  const sAt = entropy[ts.findIndex((t) => t === velocityAt)] ?? 0;
  return (
    <div className="evel__out">
      <div className="evel__stats">
        <span>v_E = <b>{velocity.toFixed(3)}</b> bit/clock</span>
        <span>S_max = <b>{maxEntropy.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="evel__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="evel__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="evel__axis-line" />
        <line x1={xOf(velocityAt) - 22} y1={yOf(sAt) + velocity * (22 / plotW * (2 * Math.PI)) * (plotH / yMax)} x2={xOf(velocityAt) + 22} y2={yOf(sAt) - velocity * (22 / plotW * (2 * Math.PI)) * (plotH / yMax)} className="evel__tangent" />
        <polyline points={path} className="evel__curve" />
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="evel__axis">{yMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="evel__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="evel__axis">t → (one period)</text>
      </svg>
      <div className="evel__legend">half-cut S(t) · steepest slope = entanglement velocity</div>
    </div>
  );
}
