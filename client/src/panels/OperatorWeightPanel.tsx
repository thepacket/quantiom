import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { operatorWeightGrowth, type OperatorWeightResult } from "../sim/operatorWeight";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};
const MAX_QUBITS = 4;

/**
 * Operator weight growth — the Pauli-support distribution of the
 * Heisenberg-evolved operator Z(t) = U_t† Z₀ U_t, swept over the t clock and
 * bucketed by weight (number of non-identity factors). Each column sums to 1;
 * weight starts at 1 and migrates upward as the operator scrambles — the
 * microscopic picture under the butterfly velocity. Runs on demand
 * (dense-unitary per time sample), n ≤ 4.
 */
export function OperatorWeightPanel({ circuit, customGates, paramValues }: Props) {
  return (
    <PanelShell id="operator-weight" title="Operator weight growth" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<OperatorWeightResult | null>(null);
  const [busy, setBusy] = useState(false);
  const n = circuit.numQubits;

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try {
        setResult(operatorWeightGrowth(circuit, paramValues, customGates, 0, "Z", 24, MAX_QUBITS));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  if (n < 1 || n > MAX_QUBITS)
    return <div className="panel__notice">Operator weight growth is capped at {MAX_QUBITS} qubits (dense unitary). This circuit has {n}.</div>;

  return (
    <div className="opw">
      <div className="opw__actions">
        <button className="opw__run" onClick={run} disabled={busy}>{busy ? "Evolving…" : "Run"}</button>
        <span className="opw__hint">W₀ = Z on q0, Heisenberg-evolved over the t clock</span>
      </div>
      {result && <Heat r={result} />}
    </div>
  );
}

const W = 300;
const H = 130;
const PAD_L = 22;
const PAD_B = 16;

function Heat({ r }: { r: OperatorWeightResult }) {
  const { ts, weights, numQubits } = r;
  const cols = ts.length;
  const rows = numQubits + 1; // weights 0..n
  const cw = (W - PAD_L) / cols;
  const ch = (H - PAD_B) / rows;
  return (
    <div className="opw__out">
      <svg viewBox={`0 0 ${W} ${H}`} className="opw__svg plot-fill" role="img">
        {weights.map((row, t) =>
          row.map((v, w) => (
            <rect
              key={`${t}-${w}`}
              x={PAD_L + t * cw}
              y={(rows - 1 - w) * ch}
              width={cw + 0.5}
              height={ch + 0.5}
              fill={`rgba(110, 177, 255, ${(0.04 + 0.92 * Math.min(1, v)).toFixed(3)})`}
            >
              <title>t={ts[t].toFixed(2)}, weight {w}: {v.toFixed(3)}</title>
            </rect>
          )),
        )}
        {Array.from({ length: rows }, (_, w) => (
          <text key={w} x={PAD_L - 3} y={(rows - 1 - w) * ch + ch / 2 + 3} textAnchor="end" className="opw__axis">{w}</text>
        ))}
        <text x={PAD_L} y={H - 4} className="opw__axis">t=0</text>
        <text x={W} y={H - 4} textAnchor="end" className="opw__axis">2π</text>
      </svg>
      <div className="opw__legend">rows = operator weight (support size), columns = time · mass climbing ⇒ scrambling</div>
    </div>
  );
}
