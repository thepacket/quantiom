import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { butterflyVelocity, type ButterflyResult } from "../sim/butterflyVelocity";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 5;

/**
 * Butterfly velocity v_B from the OTOC light-cone. Places the butterfly Z on
 * qubit 0 and the measurement Z on each other qubit, finds the
 * threshold-crossing arrival time t*(r) of C(t) at distance r, and linearly
 * fits r ≈ v_B·t* — the emergent speed of information in the circuit. Runs on
 * demand (dense-unitary OTOC per qubit). n ≤ 5, default-collapsed.
 */
export function ButterflyVelocityPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="butterfly-velocity" title="Butterfly velocity (OTOC cone)" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<ButterflyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const r = butterflyVelocity(circuit, paramValues, customGates, 0, "Z", "Z", 0.5, 32, MAX_QUBITS);
        if (!r) setError(`needs 2…${MAX_QUBITS} qubits (have ${n})`);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  if (n < 2 || n > MAX_QUBITS)
    return <div className="panel__notice">Butterfly velocity needs 2…{MAX_QUBITS} qubits (dense-unitary OTOC). This circuit has {n}.</div>;

  return (
    <div className="bvel">
      <div className="bvel__actions">
        <button className="bvel__run" onClick={run} disabled={busy}>{busy ? "Running OTOCs…" : "Run"}</button>
        <span className="bvel__hint">W = Z on q0, V = Z on each qubit, over the t clock</span>
      </div>
      {error && <div className="panel__notice">{error}</div>}
      {result && <View r={result} />}
    </div>
  );
}

const W = 300;
const H = 130;
const PAD_L = 28;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 22;

function View({ r }: { r: ButterflyResult }) {
  const pts = r.series.filter((s) => s.arrival !== null) as Array<{ distance: number; arrival: number }>;
  const tMax = Math.max(2 * Math.PI, ...pts.map((p) => p.arrival));
  const dMax = Math.max(1, ...r.series.map((s) => s.distance));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (t: number) => PAD_L + (t / tMax) * plotW;
  const yOf = (d: number) => PAD_T + (1 - d / dMax) * plotH;

  return (
    <div className="bvel__out">
      <div className="bvel__stats">
        <span>v<sub>B</sub> = <b>{r.vB !== null ? r.vB.toFixed(3) : "—"}</b> sites/clock</span>
        <span>{pts.length}/{r.series.length} fronts arrived</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bvel__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="bvel__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="bvel__axis-line" />
        {r.vB !== null && (
          <line
            x1={xOf(0)} y1={yOf(r.intercept)}
            x2={xOf(tMax)} y2={yOf(r.intercept + r.vB * tMax)}
            className="bvel__fit"
          />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={xOf(p.arrival)} cy={yOf(p.distance)} r={3} className="bvel__dot">
            <title>distance {p.distance}, arrival t* = {p.arrival.toFixed(3)}</title>
          </circle>
        ))}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="bvel__axis">{dMax}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="bvel__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="bvel__axis">arrival time t* →</text>
        <text x={4} y={PAD_T + 4} className="bvel__axis">dist</text>
      </svg>
      <div className="bvel__legend">arrival time of the OTOC front (C ≥ 0.5) vs distance · slope = v<sub>B</sub></div>
    </div>
  );
}
