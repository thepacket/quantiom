import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { berryPhase, type BerryPhaseResult } from "../sim/berryPhase";
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
const RADII = [Math.PI / 4, Math.PI / 2, Math.PI];
const RADIUS_LABEL: Record<number, string> = { [Math.PI / 4]: "π/4", [Math.PI / 2]: "π/2", [Math.PI]: "π" };

/**
 * Berry phase around a closed loop in the circuit's parameter space —
 * γ = −arg Π⟨ψ_k|ψ_{k+1}⟩ over a rectangular loop in the plane of two free
 * symbols (centred on their current values). A gauge-invariant geometric
 * phase: a quantized π / Zak phase signals a topological winding, 0 a trivial
 * loop. Complements the Berry *curvature* in the QGT panel (this integrates it
 * over a finite loop). Needs ≥ 2 free symbols; statevector path, n ≤ 12.
 */
export function BerryPhasePanel({ state, circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="berry-phase" title="Berry phase (Wilson loop)" defaultCollapsed>
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
  const [radius, setRadius] = useState<number>(Math.PI / 2);
  const hasMeasurement = useMemo(
    () => circuit.gates.some((g) => NONDETERMINISTIC.has(g.gateId)),
    [circuit.gates],
  );

  const i0 = Math.min(pair[0], symbols.length - 1);
  const i1 = Math.min(pair[1], symbols.length - 1);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || hasMeasurement) return null;
    if (n < 1 || n > MAX_QUBITS || symbols.length < 2) return null;
    if (i0 === i1) return null;
    return berryPhase(circuit, paramValues, customGates, symbols[i0], symbols[i1], radius, 16);
  }, [collapsed, data, n, symbols, i0, i1, radius, hasMeasurement, circuit, customGates, paramValues]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — the geometric phase needs the statevector path.</div>;
  if (hasMeasurement)
    return <div className="panel__notice">Mid-circuit measurement/reset collapses the pure parameterised state. Remove them to trace a Berry phase.</div>;
  if (symbols.length < 2)
    return <div className="panel__notice">Berry phase needs ≥ 2 free symbols (e.g. RY(θ), RZ(φ)). This circuit has {symbols.length}.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;

  return (
    <div className="berry">
      <div className="berry__pick">
        <label>loop in
          <select value={i0} onChange={(e) => setPair([Number(e.target.value), i1])}>
            {symbols.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>
          ×
          <select value={i1} onChange={(e) => setPair([i0, Number(e.target.value)])}>
            {symbols.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>
        </label>
        <span className="berry__radius">
          radius
          {RADII.map((r) => (
            <button key={r} className={"berry__rbtn" + (r === radius ? " berry__rbtn--on" : "")} onClick={() => setRadius(r)}>{RADIUS_LABEL[r]}</button>
          ))}
        </span>
      </div>
      {i0 === i1 ? (
        <div className="panel__notice">pick two different symbols.</div>
      ) : result ? (
        <View r={result} radius={radius} />
      ) : null}
    </div>
  );
}

function View({ r, radius }: { r: BerryPhaseResult; radius: number }) {
  const deg = (r.gamma * 180) / Math.PI;
  const nearPi = Math.abs(Math.abs(r.gamma) - Math.PI) < 0.15;
  const nearZero = Math.abs(r.gamma) < 0.15;
  const tag = nearPi ? "≈ π (topological / Zak)" : nearZero ? "≈ 0 (trivial)" : "intermediate";
  return (
    <div className="berry__out">
      <div className="berry__hero">
        γ = <b>{r.gamma.toFixed(4)}</b> rad <span className="berry__deg">({deg.toFixed(1)}°)</span>
        <span className="berry__tag">{tag}</span>
      </div>
      <div className="berry__stats">
        <span>loop {r.symbols[0]} × {r.symbols[1]}, half-width {RADIUS_LABEL[radius] ?? radius.toFixed(2)}</span>
        <span>|Π⟨ψ|ψ⟩| = <b>{r.overlapMagnitude.toFixed(3)}</b></span>
      </div>
      <div className="berry__legend">
        γ = −arg Π⟨ψ_k|ψ_{"{k+1}"}⟩ around the loop · low overlap magnitude ⇒ the loop nears a degeneracy.
      </div>
    </div>
  );
}
