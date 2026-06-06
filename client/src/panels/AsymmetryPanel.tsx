import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementAsymmetrySweep, MAX_ASYM_QUBITS, type AsymmetryResult } from "../sim/entanglementAsymmetry";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

/**
 * Entanglement asymmetry ΔS_A of the first ⌈n/2⌉ qubits, swept over circuit
 * depth — how much the subsystem breaks the U(1) (excitation-number) symmetry,
 * column by column. ΔS = S(charge-projected ρ_A) − S(ρ_A) ≥ 0; it rises as
 * cross-charge coherences develop and can *restore* (fall) as a circuit
 * scrambles — the quantum Mpemba effect. Statevector path, n ≤ 12.
 */
export function AsymmetryPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="entanglement-asymmetry" title="Entanglement asymmetry" defaultCollapsed>
      <Body state={state} circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 2 || n > MAX_ASYM_QUBITS) return null;
    if (data?.isStabilizer) return null;
    return entanglementAsymmetrySweep(circuit, paramValues, customGates);
  }, [collapsed, n, data, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode for the reduced-state asymmetry.</div>;
  if (n > MAX_ASYM_QUBITS)
    return <div className="panel__notice">{n} qubits — asymmetry is capped at {MAX_ASYM_QUBITS}.</div>;
  if (!result || result.numCols < 1) return <div className="panel__notice">add some gates (columns) to sweep over.</div>;

  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: AsymmetryResult }) {
  const { asymmetry, numCols, subsystemSize, numQubits } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(1e-6, ...asymmetry) * 1.1;
  const xOf = (c: number) => PAD_L + (numCols <= 1 ? plotW / 2 : (c / (numCols - 1)) * plotW);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const path = asymmetry.map((v, c) => `${xOf(c).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const last = asymmetry[asymmetry.length - 1];
  const peak = Math.max(...asymmetry);

  return (
    <div className="asym__out">
      <div className="asym__stats">
        <span>A = {subsystemSize}/{numQubits} qubits</span>
        <span>ΔS now <b>{last.toFixed(3)}</b></span>
        <span>peak <b>{peak.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="asym__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="asym__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="asym__axis-line" />
        <polyline points={path} className="asym__curve" />
        {asymmetry.map((v, c) => <circle key={c} cx={xOf(c)} cy={yOf(v)} r={1.6} className="asym__dot" />)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="asym__axis">{yMax.toFixed(2)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="asym__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="asym__axis">ΔS_A vs column →</text>
      </svg>
      <div className="asym__legend">0 ⇒ symmetric subsystem · a rise-then-fall is symmetry restoration (Mpemba)</div>
    </div>
  );
}
