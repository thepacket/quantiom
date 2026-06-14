import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { workDistribution, type WorkDistResult } from "../sim/workDistribution";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 5;

const PRESETS: Record<string, string> = {
  "TFIM (3 spins)": "-1*ZZI - 1*IZZ - 0.5*XII - 0.5*IXI - 0.5*IIX",
  "Heisenberg (2 spins)": "1*XX + 1*YY + 1*ZZ",
  "Single field": "1*Z + 0.5*X",
};

/**
 * Two-point-measurement work distribution P(W) for a quench: measure the
 * energy of H on |0…0⟩, apply the circuit as the quench unitary, measure H
 * again. The histogram of work W = E_m − E_n (weighted by the transition
 * probabilities) is the central object of quantum fluctuation theorems. Runs
 * on demand (H diagonalisation + dense unitary), n ≤ 5.
 */
export function WorkDistributionPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="work-distribution" title="Work distribution (TPM)" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [text, setText] = useState(PRESETS["TFIM (3 spins)"]);
  const [result, setResult] = useState<WorkDistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const terms = parsePauliSum(text);
        if (terms.length === 0) { setError("no terms"); setBusy(false); return; }
        const need = pauliSumQubitCount(terms);
        if (need !== n) { setError(`H acts on ${need} qubits but the circuit has ${n}`); setBusy(false); return; }
        const r = workDistribution(terms, circuit, paramValues, customGates, 24, MAX_QUBITS);
        if (!r) setError(`needs 1…${MAX_QUBITS} qubits`);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  if (n > MAX_QUBITS)
    return <div className="panel__notice">Work distribution is capped at {MAX_QUBITS} qubits. This circuit has {n}.</div>;

  return (
    <div className="work">
      <div className="work__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="work__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea className="work__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false} placeholder="H as a Pauli sum, e.g. -1*ZZ - 0.5*XI - 0.5*IX" />
      <div className="work__actions">
        <button className="work__run" onClick={run} disabled={busy}>{busy ? "Computing…" : "Run quench"}</button>
        <span className="work__hint">|0…0⟩ → measure H → circuit U → measure H</span>
      </div>
      {error && <div className="panel__notice">{error}</div>}
      {result && <Hist r={result} />}
    </div>
  );
}

const W = 300;
const H = 110;
const PAD_B = 16;

function Hist({ r }: { r: WorkDistResult }) {
  const { works, probs, meanWork, variance } = r;
  const max = Math.max(1e-9, ...probs);
  const bw = Math.max(2, (W - 4) / probs.length - 1);
  // Mark W=0 (zero-work line).
  const wMin = works[0] - r.binWidth / 2;
  const wMax = works[works.length - 1] + r.binWidth / 2;
  const xZero = wMax > wMin ? 2 + ((0 - wMin) / (wMax - wMin)) * (W - 4) : 0;
  return (
    <div className="work__out">
      <div className="work__stats">
        <span>⟨W⟩ = <b>{meanWork.toFixed(3)}</b></span>
        <span>Var = <b>{variance.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="work__svg plot-fill" role="img">
        <line x1={0} y1={H - PAD_B} x2={W} y2={H - PAD_B} className="work__axis-line" />
        {xZero >= 0 && xZero <= W && <line x1={xZero} y1={4} x2={xZero} y2={H - PAD_B} className="work__zero" />}
        {probs.map((v, i) => {
          const h = (v / max) * (H - PAD_B - 4);
          const x = 2 + i * (bw + 1);
          return <rect key={i} x={x} y={H - PAD_B - h} width={bw} height={h} className="work__bar"><title>W ≈ {works[i].toFixed(3)}: P = {v.toFixed(4)}</title></rect>;
        })}
        <text x={2} y={H - 3} className="work__axis">{wMin.toFixed(1)}</text>
        <text x={W - 2} y={H - 3} textAnchor="end" className="work__axis">{wMax.toFixed(1)}</text>
        <text x={W / 2} y={H - 3} textAnchor="middle" className="work__axis">work W →</text>
      </svg>
      <div className="work__legend">P(W) over a quench · the W=0 line marks zero work (sudden-quench delta survives for [H,U]=0)</div>
    </div>
  );
}
