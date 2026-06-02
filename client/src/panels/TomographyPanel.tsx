import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { processTomography, MAX_TOMOGRAPHY_QUBITS, type ProcessResult } from "../sim/tomography";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  noise?: NoiseModel;
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

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"heatmap" | "hinton">("heatmap");
  const [useNoise, setUseNoise] = useState(false);

  const run = () => {
    setBusy(true);
    setErr(null);
    setTimeout(() => {
      try {
        setResult(processTomography(circuit, paramValues, customGates, useNoise && noise?.enabled ? noise : undefined));
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
      <div className="tomo__bar">
        <button className="tomo__run" onClick={run} disabled={busy}>
          {busy ? "Computing…" : "Compute χ"}
        </button>
        {noise?.enabled && (
          <label className="tomo__noise" title="Run trajectories through the active noise model">
            <input type="checkbox" checked={useNoise} onChange={(e) => setUseNoise(e.target.checked)} />
            noise
          </label>
        )}
        <div className="tomo__view">
          <button
            className={"tomo__view-btn" + (view === "heatmap" ? " tomo__view-btn--on" : "")}
            onClick={() => setView("heatmap")}
          >
            heatmap
          </button>
          <button
            className={"tomo__view-btn" + (view === "hinton" ? " tomo__view-btn--on" : "")}
            onClick={() => setView("hinton")}
          >
            Hinton
          </button>
        </div>
      </div>
      {err && <div className="panel__error">{err}</div>}
      {result && (view === "heatmap" ? <ChiTable result={result} /> : <HintonView result={result} />)}
    </div>
  );
}

function HintonView({ result }: { result: ProcessResult }) {
  // Hinton: each cell is a square scaled by sqrt(magnitude). Positive
  // (real part > 0) draws light; negative draws dark. For χ matrices
  // entries are complex; use Re(χ) sign and |χ| magnitude.
  const N = result.chi.length;
  const cellSize = 18;
  const totalSize = N * cellSize;
  let maxMag = 0;
  for (const row of result.chi) {
    for (const c of row) {
      const m = Math.hypot(c.re, c.im);
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag === 0) maxMag = 1;
  return (
    <div className="tomo__result">
      <div className="tomo__hint">
        Hinton diagram. Each square's side ∝ √|χ|; light squares = Re(χ)≥0, dark = Re(χ)&lt;0.
      </div>
      <svg width={totalSize + 8} height={totalSize + 8} className="tomo__hinton">
        <rect width={totalSize + 8} height={totalSize + 8} fill="#1a1f27" />
        {result.chi.map((row, m) =>
          row.map((c, k) => {
            const mag = Math.hypot(c.re, c.im) / maxMag;
            const side = Math.max(1, Math.sqrt(mag) * (cellSize - 1));
            const cx = 4 + k * cellSize + cellSize / 2;
            const cy = 4 + m * cellSize + cellSize / 2;
            const fill = c.re >= 0 ? "#e8edf2" : "#3c4856";
            return (
              <rect
                key={`${m}-${k}`}
                x={cx - side / 2}
                y={cy - side / 2}
                width={side}
                height={side}
                fill={fill}
              />
            );
          }),
        )}
      </svg>
      <div className="tomo__hint" style={{ fontFamily: "ui-monospace, monospace" }}>
        Pauli order: {result.labels.join(", ")}
      </div>
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
