import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { temporalAutocorrelation, type AutocorrelationResult } from "../sim/autocorrelation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 6;

/**
 * Temporal autocorrelation C(t) = (1/2ⁿ) Tr[Z_q(t) Z_q(0)] of a single qubit
 * over the `t` clock (infinite-temperature, state-independent), with its
 * spectral function (Fourier transform). C(t) stays near 1 for a conserved /
 * localized mode and decays to 0 for a thermalizing one; the spectrum's peaks
 * are the relaxation frequencies. Built from the dense unitary per sample,
 * run on demand. n ≤ 6.
 */
export function AutocorrelationPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="autocorrelation" title="Temporal autocorrelation ⟨Z(t)Z(0)⟩" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<AutocorrelationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [qubit, setQubit] = useState(0);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try { setResult(temporalAutocorrelation(circuit, paramValues, customGates, Math.min(qubit, n - 1), 48, MAX_QUBITS)); }
      finally { setBusy(false); }
    }, 0);
  };

  if (n < 1 || n > MAX_QUBITS)
    return <div className="panel__notice">Autocorrelation is capped at {MAX_QUBITS} qubits (dense unitary per sample). This circuit has {n}.</div>;

  return (
    <div className="acorr">
      <div className="acorr__actions">
        <label>qubit
          <select value={Math.min(qubit, n - 1)} onChange={(e) => setQubit(Number(e.target.value))}>
            {Array.from({ length: n }, (_, q) => <option key={q} value={q}>q{q}</option>)}
          </select>
        </label>
        <button className="acorr__run" onClick={run} disabled={busy}>{busy ? "Computing…" : "Run"}</button>
      </div>
      {result && <Plot r={result} />}
    </div>
  );
}

const W = 300;
const H = 110;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;

function Plot({ r }: { r: AutocorrelationResult }) {
  const { ts, C, freqs, spectrum } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (k: number) => PAD_L + (k / (ts.length - 1)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v + 1) / 2) * plotH; // [-1,1]
  const path = C.map((v, k) => `${xOf(k).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  // Spectrum mini-bars.
  const specMax = Math.max(...spectrum.slice(1), 1e-9);
  const late = C.slice(Math.floor(C.length / 2));
  const plateau = late.reduce((a, b) => a + Math.abs(b), 0) / late.length;
  return (
    <div className="acorr__out">
      <div className="acorr__stats">
        <span>C(0) = <b>{C[0].toFixed(2)}</b></span>
        <span>late ⟨|C|⟩ = <b>{plateau.toFixed(3)}</b></span>
        <span className="acorr__tag">{plateau > 0.3 ? "persistent (conserved-like)" : "relaxes"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="acorr__svg plot-fill" role="img">
        <line x1={PAD_L} y1={yOf(0)} x2={W - PAD_R} y2={yOf(0)} className="acorr__zero" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="acorr__axis-line" />
        <polyline points={path} className="acorr__curve" />
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="acorr__axis">+1</text>
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="acorr__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="acorr__axis">t →</text>
      </svg>
      <div className="acorr__spec">
        {spectrum.map((s, m) => (m === 0 ? null : <span key={m} className="acorr__bar" style={{ height: `${(s / specMax) * 18 + 1}px` }} title={`bin ${freqs[m]}: ${s.toFixed(3)}`} />))}
      </div>
      <div className="acorr__legend">⟨Z(t)Z(0)⟩ (infinite-T) · bars = spectral function (relaxation frequencies)</div>
    </div>
  );
}
