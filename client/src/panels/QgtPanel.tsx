import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { quantumGeometricTensor, MAX_QGT_QUBITS, MAX_QGT_SYMBOLS, type QgtResult } from "../sim/qgt";
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
 * Quantum geometric tensor: the Fubini–Study metric g_ij = Re Q_ij on the
 * circuit's parameter space (the geometry the quantum natural gradient
 * descends) and the Berry curvature F_ij = −2 Im Q_ij. Shows the metric as a
 * heatmap with its determinant (the local state-space volume √det g) and
 * principal sensitivities (eigenvalues). Needs free symbols; statevector path,
 * n ≤ 12, default-collapsed.
 */
export function QgtPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="qgt" title="Quantum geometric tensor" defaultCollapsed>
      <Body state={state} circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

const NONDETERMINISTIC = new Set(["measure", "measure_x", "measure_y", "reset"]);

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
  const symbols = data?.freeSymbols ?? [];
  const hasMeasurement = useMemo(
    () => circuit.gates.some((g) => NONDETERMINISTIC.has(g.gateId)),
    [circuit.gates],
  );

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || hasMeasurement) return null;
    if (n < 1 || n > MAX_QGT_QUBITS) return null;
    if (symbols.length < 1 || symbols.length > MAX_QGT_SYMBOLS) return null;
    return quantumGeometricTensor(circuit, customGates, paramValues, symbols);
  }, [collapsed, data, n, symbols, hasMeasurement, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — the parameter geometry needs the statevector path.</div>;
  if (hasMeasurement)
    return <div className="panel__notice">The QGT is defined for a pure parameterised state ψ(θ); mid-circuit measurement/reset collapses it. Remove them to map the geometry.</div>;
  if (symbols.length === 0)
    return <div className="panel__notice">No free parameters — add a gate with a symbolic angle (e.g. RY(θ)) and a free variable to map its parameter-space geometry.</div>;
  if (symbols.length > MAX_QGT_SYMBOLS)
    return <div className="panel__notice">{symbols.length} free symbols — QGT is capped at {MAX_QGT_SYMBOLS}.</div>;
  if (n > MAX_QGT_QUBITS)
    return <div className="panel__notice">{n} qubits — QGT is capped at {MAX_QGT_QUBITS}.</div>;
  if (!result) return null;

  return <View r={result} />;
}

function View({ r }: { r: QgtResult }) {
  const { symbols, metric, berry, metricEigenvalues, metricDet } = r;
  const k = symbols.length;
  let maxAbs = 1e-9;
  for (const row of metric) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
  let maxBerry = 0;
  for (const row of berry) for (const v of row) maxBerry = Math.max(maxBerry, Math.abs(v));

  const lo = metricEigenvalues[0] ?? 0;
  const hi = metricEigenvalues[metricEigenvalues.length - 1] ?? 0;

  return (
    <div className="qgt">
      <div className="qgt__stats">
        <span>√det g = <b>{Math.sqrt(Math.max(0, metricDet)).toExponential(2)}</b></span>
        <span>eig g ∈ [<b>{lo.toFixed(3)}</b>, <b>{hi.toFixed(3)}</b>]</span>
      </div>
      <div className="qgt__grid" style={{ gridTemplateColumns: `auto repeat(${k}, 1fr)` }}>
        <div className="qgt__corner" />
        {symbols.map((s) => <div key={`c${s}`} className="qgt__hdr">{s}</div>)}
        {metric.map((row, i) => (
          <Row key={`r${i}`} sym={symbols[i]} row={row} maxAbs={maxAbs} />
        ))}
      </div>
      <div className="qgt__legend">
        Fubini–Study metric g<sub>ij</sub> (the QNG geometry) ·{" "}
        {maxBerry > 1e-6
          ? <span className="qgt__berry">Berry curvature present, max |F| = {maxBerry.toFixed(3)}</span>
          : <span>real state — Berry curvature ≈ 0</span>}
      </div>
    </div>
  );
}

function Row({ sym, row, maxAbs }: { sym: string; row: number[]; maxAbs: number }) {
  return (
    <>
      <div className="qgt__hdr qgt__hdr--row">{sym}</div>
      {row.map((v, j) => {
        const t = Math.abs(v) / maxAbs;
        const bg = v >= 0
          ? `rgba(110, 177, 255, ${(0.12 + 0.78 * t).toFixed(3)})`
          : `rgba(255, 142, 111, ${(0.12 + 0.78 * t).toFixed(3)})`;
        return (
          <div key={j} className="qgt__cell" style={{ background: bg }} title={`g[${sym}] = ${v.toFixed(5)}`}>
            {Math.abs(v) < 0.0005 ? "0" : v.toFixed(2)}
          </div>
        );
      })}
    </>
  );
}
