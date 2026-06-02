import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { processTomography, MAX_TOMOGRAPHY_QUBITS, type ProcessResult } from "../sim/tomography";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

/**
 * Process tomography panel. For circuits of up to 4 qubits (default cap),
 * reconstructs the process matrix χ in the Pauli basis. Treats the circuit
 * as a noiseless unitary — noise-mode tomography is a follow-up.
 */
export function TomographyPanel(props: Props) {
  return (
    <PanelShell id="tomography" title="Process tomography (χ matrix)" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setErr(null);
    setTimeout(() => {
      try {
        setResult(processTomography(circuit, paramValues, customGates));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  if (circuit.numQubits > MAX_TOMOGRAPHY_QUBITS) {
    return (
      <div className="panel__placeholder">
        Capped at {MAX_TOMOGRAPHY_QUBITS} qubits (χ is 4ⁿ × 4ⁿ). Current circuit
        has {circuit.numQubits}.
      </div>
    );
  }

  return (
    <div className="tomo">
      <button className="tomo__run" onClick={run} disabled={busy}>
        {busy ? "Computing…" : "Compute χ"}
      </button>
      {err && <div className="panel__error">{err}</div>}
      {result && <ChiTable result={result} />}
    </div>
  );
}

function ChiTable({ result }: { result: ProcessResult }) {
  // Find magnitude scale for the heatmap.
  let maxMag = 0;
  for (const row of result.chi) {
    for (const c of row) {
      const m = Math.hypot(c.re, c.im);
      if (m > maxMag) maxMag = m;
    }
  }
  return (
    <div className="tomo__result">
      <div className="tomo__meta">
        {result.closestMatch && (
          <div className="tomo__match">
            closest to <strong>{result.closestMatch.name}</strong> · F = {result.closestMatch.fidelity.toFixed(4)}
          </div>
        )}
        <div className="tomo__hint">
          β decomposition: U = Σ β_P · P. Top components ({" "}
          {result.beta
            .map((b, i) => ({ b, i }))
            .sort((a, b) => Math.hypot(b.b.re, b.b.im) - Math.hypot(a.b.re, a.b.im))
            .slice(0, 4)
            .filter((x) => Math.hypot(x.b.re, x.b.im) > 0.01)
            .map((x) => `${result.labels[x.i]} (${(Math.hypot(x.b.re, x.b.im)).toFixed(3)})`)
            .join(", ")}
          ).
        </div>
      </div>
      <div className="tomo__chi-wrap">
        <table className="tomo__chi">
          <thead>
            <tr>
              <th></th>
              {result.labels.map((l) => <th key={l}>{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.chi.map((row, m) => (
              <tr key={m}>
                <th>{result.labels[m]}</th>
                {row.map((c, k) => {
                  const mag = Math.hypot(c.re, c.im);
                  const alpha = maxMag > 0 ? Math.min(1, mag / maxMag) : 0;
                  return (
                    <td
                      key={k}
                      className="tomo__cell"
                      style={{ background: `rgba(124, 196, 255, ${alpha * 0.65})` }}
                      title={`χ[${result.labels[m]},${result.labels[k]}] = ${c.re.toFixed(3)} + ${c.im.toFixed(3)}i`}
                    >
                      {mag > 0.01 ? mag.toFixed(2) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
