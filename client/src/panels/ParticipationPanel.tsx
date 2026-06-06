import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import {
  participation,
  participationSweep,
  type ParticipationResult,
  type ParticipationSweepResult,
} from "../sim/participation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 16;

/**
 * Participation / localization: the inverse participation ratio IPR = Σpᵢ²,
 * the effective number of occupied basis states PR = 1/IPR, and the Shannon /
 * Rényi-2 participation entropies. The Anderson / many-body-localization
 * diagnostic — a localized state keeps PR ~ O(1) while a thermal one spreads
 * to PR ∝ 2ⁿ. Reads the basis probabilities (works in noise mode); the sweep
 * shows PR growing column-by-column. n ≤ 16, default-collapsed.
 */
export function ParticipationPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="participation" title="Participation / IPR" defaultCollapsed>
      <Body state={state} circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;

  const scalar = useMemo<ParticipationResult | null>(() => {
    if (collapsed || !data || n < 1 || n > MAX_QUBITS) return null;
    if (!data.probabilities || data.probabilities.length < (1 << n)) return null;
    return participation(data.probabilities, n);
  }, [collapsed, data, n]);

  const sweep = useMemo<ParticipationSweepResult | null>(() => {
    if (collapsed || n < 1 || n > MAX_QUBITS) return null;
    return participationSweep(circuit, paramValues, customGates);
  }, [collapsed, n, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the basis probabilities.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — participation is capped at {MAX_QUBITS}.</div>;
  if (!scalar) return null;

  return <View r={scalar} sweep={sweep && sweep.numCols > 1 ? sweep : null} />;
}

function View({ r, sweep }: { r: ParticipationResult; sweep: ParticipationSweepResult | null }) {
  // Log-scale gauge from 1 (localized) to D (uniform).
  const logFrac = Math.log(r.participationRatio) / Math.log(r.dim);
  const pct = Math.max(0, Math.min(1, logFrac)) * 100;

  return (
    <div className="part">
      <div className="part__stats">
        <span>PR = <b>{r.participationRatio.toFixed(2)}</b> / {r.dim}</span>
        <span>IPR = <b>{r.ipr.toFixed(4)}</b></span>
        <span>S₁ = <b>{r.shannon.toFixed(3)}</b></span>
        <span>S₂ = <b>{r.renyi2.toFixed(3)}</b></span>
      </div>
      <div className="part__gauge">
        <span className="part__end">localized</span>
        <div className="part__bar"><div className="part__fill" style={{ width: `${pct}%` }} /></div>
        <span className="part__end">uniform</span>
      </div>
      {sweep && <Sweep s={sweep} />}
      <div className="part__legend">PR = effective # of occupied basis states · log gauge 1 → 2ⁿ</div>
    </div>
  );
}

const W = 300;
const H = 90;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;

function Sweep({ s }: { s: ParticipationSweepResult }) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const cols = s.numCols;
  const yMax = Math.max(s.dim, ...s.pr) || 1;
  const xOf = (c: number) => PAD_L + (cols <= 1 ? plotW / 2 : (c / (cols - 1)) * plotW);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const path = s.pr.map((v, c) => `${xOf(c).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const dimY = yOf(s.dim);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="part__svg plot-fill" role="img">
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="part__axis-line" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="part__axis-line" />
      {/* D reference (full delocalization) */}
      <line x1={PAD_L} y1={dimY} x2={W - PAD_R} y2={dimY} className="part__dim" />
      <text x={W - PAD_R} y={dimY - 2} textAnchor="end" className="part__axis">D = {s.dim}</text>
      <polyline points={path} className="part__curve" />
      <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="part__axis">{yMax.toFixed(0)}</text>
      <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="part__axis">1</text>
      <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="part__axis">PR vs column →</text>
    </svg>
  );
}
