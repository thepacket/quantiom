import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { chernNumber, type ChernResult } from "../sim/chernNumber";
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
const GRID = 12;

/**
 * Chern number over the 2-torus of two free symbols — the gauge-invariant
 * Fukui–Hatsugai–Suzuki lattice flux summed over the parameter torus,
 * C = (1/2π) Σ F(k), quantized to an integer. A non-zero C is a topological
 * fingerprint of the state's parameter dependence. The per-plaquette Berry
 * flux is shown as a curvature heatmap. Needs ≥ 2 free symbols; statevector
 * path, n ≤ 12, default-collapsed.
 */
export function ChernNumberPanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="chern-number" title="Chern number" defaultCollapsed>
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
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  const hasMeasurement = useMemo(() => circuit.gates.some((g) => NONDETERMINISTIC.has(g.gateId)), [circuit.gates]);

  const i0 = Math.min(pair[0], symbols.length - 1);
  const i1 = Math.min(pair[1], symbols.length - 1);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || hasMeasurement) return null;
    if (n < 1 || n > MAX_QUBITS || symbols.length < 2 || i0 === i1) return null;
    return chernNumber(circuit, paramValues, customGates, symbols[i0], symbols[i1], GRID, MAX_QUBITS);
  }, [collapsed, data, n, symbols, i0, i1, hasMeasurement, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — the parameter geometry needs the statevector path.</div>;
  if (hasMeasurement) return <div className="panel__notice">Mid-circuit measurement/reset collapses the pure parameterised state. Remove them to map the topology.</div>;
  if (symbols.length < 2) return <div className="panel__notice">Chern number needs ≥ 2 free symbols (e.g. RY(θ), RZ(φ)). This circuit has {symbols.length}.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;

  return (
    <div className="chern">
      <div className="chern__pick">
        <label>torus
          <select value={i0} onChange={(e) => setPair([Number(e.target.value), i1])}>
            {symbols.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>×
          <select value={i1} onChange={(e) => setPair([i0, Number(e.target.value)])}>
            {symbols.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>
        </label>
      </div>
      {i0 === i1 ? <div className="panel__notice">pick two different symbols.</div> : result ? <View r={result} /> : null}
    </div>
  );
}

const SIZE = 200;

function View({ r }: { r: ChernResult }) {
  const { curvature, chern, grid, symbols } = r;
  const cell = SIZE / grid;
  let maxAbs = 1e-9;
  for (const row of curvature) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
  return (
    <div className="chern__out">
      <div className="chern__stats">
        <span>C = <b>{chern.toFixed(3)}</b></span>
        <span className="chern__tag">{Math.abs(chern) > 0.5 ? `≈ ${Math.round(chern)} (topological)` : "≈ 0 (trivial)"}</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chern__svg plot-fill" role="img">
        {curvature.map((row, i) =>
          row.map((v, j) => {
            const t = Math.abs(v) / maxAbs;
            const bg = v >= 0
              ? `rgba(110, 177, 255, ${(0.05 + 0.85 * t).toFixed(3)})`
              : `rgba(255, 142, 111, ${(0.05 + 0.85 * t).toFixed(3)})`;
            return <rect key={`${i}-${j}`} x={i * cell} y={SIZE - (j + 1) * cell} width={cell + 0.5} height={cell + 0.5} fill={bg}><title>flux = {v.toFixed(3)}</title></rect>;
          }),
        )}
      </svg>
      <div className="chern__legend">Berry curvature over the {symbols[0]}×{symbols[1]} torus · blue +, orange − · C = (1/2π)∮ ≈ integer</div>
    </div>
  );
}
