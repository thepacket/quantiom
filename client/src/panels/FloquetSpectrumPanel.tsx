import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { floquetSpectrum, type FloquetResult } from "../sim/floquetSpectrum";
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
 * Floquet quasi-energy spectrum — the eigenphases e^{iθ_k} of the circuit
 * unitary (the one-period Floquet operator) on the unit circle, with the
 * level-spacing gap-ratio ⟨r⟩. Poisson ⟨r⟩ ≈ 0.39 (integrable) vs circular-
 * ensemble repulsion ⟨r⟩ ≈ 0.53 (chaotic). Recovered from the commuting
 * Hermitian parts of U (no general complex eigensolver). On-demand, n ≤ 6.
 */
export function FloquetSpectrumPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="floquet-spectrum" title="Floquet quasi-energies" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<FloquetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try { setResult(floquetSpectrum(circuit, paramValues, customGates, MAX_QUBITS)); }
      finally { setBusy(false); }
    }, 0);
  };

  if (n < 1 || n > MAX_QUBITS)
    return <div className="panel__notice">Floquet spectrum is capped at {MAX_QUBITS} qubits (dense unitary). This circuit has {n}.</div>;

  return (
    <div className="floq">
      <div className="floq__actions">
        <button className="floq__run" onClick={run} disabled={busy}>{busy ? "Diagonalising U…" : "Run"}</button>
        <span className="floq__hint">eigenphases of the circuit unitary U</span>
      </div>
      {result && <View r={result} />}
    </div>
  );
}

const CS = 130; // circle stage
const R = 52;

function View({ r }: { r: FloquetResult }) {
  const cx = CS / 2, cy = CS / 2;
  // Spacing histogram.
  const bins = 10;
  const sMax = Math.max(...r.spacings, 1e-9);
  const hist = new Array<number>(bins).fill(0);
  for (const s of r.spacings) { let b = Math.floor((s / (sMax * 1.0001)) * bins); if (b >= bins) b = bins - 1; if (b >= 0) hist[b]++; }
  const hMax = Math.max(1, ...hist);
  const HW = 150, HH = 110, HPB = 16;
  const bw = (HW - 4) / bins;
  return (
    <div className="floq__out">
      <div className="floq__stats">
        <span>⟨r⟩ = <b>{r.meanR.toFixed(3)}</b></span>
        <span className="floq__tag">{r.meanR < 0.46 ? "Poisson (integrable)" : "level repulsion (chaotic)"}</span>
        <span>{r.quasiEnergies.length} levels</span>
      </div>
      <div className="floq__row">
        <svg viewBox={`0 0 ${CS} ${CS}`} className="floq__circle" role="img">
          <circle cx={cx} cy={cy} r={R} className="floq__ring" />
          {r.quasiEnergies.map((th, i) => (
            <circle key={i} cx={cx + R * Math.cos(th)} cy={cy - R * Math.sin(th)} r={2.4} className="floq__qe">
              <title>θ = {th.toFixed(3)}</title>
            </circle>
          ))}
        </svg>
        <svg viewBox={`0 0 ${HW} ${HH}`} className="floq__hist" role="img">
          <line x1={0} y1={HH - HPB} x2={HW} y2={HH - HPB} className="floq__axis-line" />
          {hist.map((c, i) => {
            const h = (c / hMax) * (HH - HPB - 4);
            return <rect key={i} x={2 + i * bw} y={HH - HPB - h} width={bw - 1} height={h} className="floq__bar" />;
          })}
          <text x={2} y={HH - 4} className="floq__axis">0</text>
          <text x={HW - 2} y={HH - 4} textAnchor="end" className="floq__axis">spacing s</text>
        </svg>
      </div>
      <div className="floq__legend">quasi-energies on the unit circle · spacing histogram (gap-ratio ⟨r⟩)</div>
    </div>
  );
}
