import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { operatorEntanglement, MAX_OPENT_QUBITS, type OperatorEntanglementResult } from "../sim/operatorEntanglement";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

/**
 * Operator entanglement (entangling power) of the circuit unitary U: the
 * operator-Schmidt spectrum across the middle bipartition, as a bar chart,
 * with the operator entanglement entropy E_op. Measures how non-local the
 * whole gate sequence is, independent of input — a product U is a single bar
 * (E_op = 0); a CNOT across the cut gives E_op = 1; a SWAP is maximal. n ≤ 6.
 */
export function OperatorEntanglementPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="operator-entanglement" title="Operator entanglement" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 2 || n > MAX_OPENT_QUBITS) return null;
    return operatorEntanglement(circuit, paramValues, customGates);
  }, [collapsed, n, circuit, paramValues, customGates]);

  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (n > MAX_OPENT_QUBITS)
    return <div className="panel__notice">{n} qubits — operator entanglement is capped at {MAX_OPENT_QUBITS} (builds the dense U).</div>;
  if (!result) return null;

  return <View r={result} />;
}

const W = 300;
const H = 110;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

function View({ r }: { r: OperatorEntanglementResult }) {
  const { spectrum, entropy, cutA, numQubits } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const show = spectrum.slice(0, 48);
  const m = show.length;
  const slot = plotW / Math.max(1, m);
  const bw = Math.max(2, slot * 0.78);
  const yMax = Math.max(1e-9, show[0]);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const eMax = 2 * cutA; // log₂ of the max Schmidt rank (2^{2|A|})^{1/2}... bound = 2·|A|
  const frac = eMax > 0 ? entropy / eMax : 0;

  return (
    <div className="opent">
      <div className="opent__stats">
        <span>E_op = <b>{entropy.toFixed(3)}</b> ebit</span>
        <span>cut {cutA}|{numQubits - cutA}</span>
        <span>{(frac * 100).toFixed(0)}% of max</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="opent__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="opent__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="opent__axis-line" />
        {show.map((v, i) => (
          <rect key={i} x={(PAD_L + slot * i + (slot - bw) / 2).toFixed(1)} y={yOf(v).toFixed(1)} width={bw.toFixed(1)} height={(H - PAD_B - yOf(v)).toFixed(1)} className="opent__bar">
            <title>λ{i} = {v.toFixed(4)}</title>
          </rect>
        ))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="opent__axis">{yMax.toFixed(2)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="opent__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="opent__axis">operator-Schmidt coefficients λᵢ →</text>
      </svg>
      <div className="opent__legend">a single bar ⇒ product (non-entangling) U · flat spectrum ⇒ maximally entangling</div>
    </div>
  );
}
