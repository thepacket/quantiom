import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { otocLightcone, type OtocLightconeResult } from "../sim/otocLightcone";
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
 * OTOC light-cone — the out-of-time-order correlator C(t) over the full
 * (qubit, time) plane, with the butterfly Z on qubit 0 and the measurement Z
 * swept over every qubit and the t clock. The rising wavefront is the operator
 * light-cone (its slope is the butterfly velocity). Runs on demand
 * (dense-unitary OTOC per qubit). n ≤ 5, default-collapsed.
 */
export function OtocLightconePanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="otoc-lightcone" title="OTOC light-cone" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<OtocLightconeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        setResult(otocLightcone(circuit, paramValues, customGates, 0, "Z", "Z", 28, MAX_QUBITS));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  if (n < 2 || n > MAX_QUBITS)
    return <div className="panel__notice">OTOC light-cone needs 2…{MAX_QUBITS} qubits (dense unitary per qubit). This circuit has {n}.</div>;

  return (
    <div className="otoclc">
      <div className="otoclc__actions">
        <button className="otoclc__run" onClick={run} disabled={busy}>{busy ? "Computing OTOCs…" : "Run"}</button>
        <span className="otoclc__hint">W = Z on q0; V = Z swept over qubits × t</span>
      </div>
      {result && <Heat r={result} />}
    </div>
  );
}

const W = 300;
const H = 140;
const PAD_L = 22;
const PAD_B = 16;

function Heat({ r }: { r: OtocLightconeResult }) {
  const { ts, grid, numQubits: n, maxC } = r;
  const cols = ts.length;
  const cw = (W - PAD_L) / cols;
  const ch = (H - PAD_B) / n;
  const norm = Math.max(maxC, 1e-9);
  return (
    <div className="otoclc__out">
      <svg viewBox={`0 0 ${W} ${H}`} className="otoclc__svg plot-fill" role="img">
        {grid.map((row, q) =>
          row.map((c, k) => (
            <rect key={`${q}-${k}`} x={PAD_L + k * cw} y={q * ch} width={cw + 0.5} height={ch + 0.5}
              fill={`rgba(255, 142, 111, ${(0.03 + 0.95 * Math.min(1, c / norm)).toFixed(3)})`}>
              <title>q{q}, t={ts[k].toFixed(2)}: C = {c.toFixed(3)}</title>
            </rect>
          )),
        )}
        {Array.from({ length: n }, (_, q) => (
          <text key={q} x={PAD_L - 3} y={q * ch + ch / 2 + 3} textAnchor="end" className="otoclc__axis">q{q}</text>
        ))}
        <text x={PAD_L} y={H - 4} className="otoclc__axis">t=0</text>
        <text x={W} y={H - 4} textAnchor="end" className="otoclc__axis">2π</text>
      </svg>
      <div className="otoclc__legend">rows = qubit (W on q0), columns = time · the rising front is the operator light-cone</div>
    </div>
  );
}
