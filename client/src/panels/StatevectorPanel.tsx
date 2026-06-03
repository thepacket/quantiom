import { useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { Tex } from "./Tex";
import { PanelShell } from "./PanelShell";

type Props = { state: SimState };

const EPS = 1e-6;

function formatComplex(re: number, im: number): string {
  if (Math.abs(re) < EPS && Math.abs(im) < EPS) return "0";
  if (Math.abs(im) < EPS) return re.toFixed(4);
  if (Math.abs(re) < EPS) {
    const sign = im < 0 ? "-" : "";
    return `${sign}${Math.abs(im).toFixed(4)}i`;
  }
  const sign = im < 0 ? "-" : "+";
  return `${re.toFixed(4)} ${sign} ${Math.abs(im).toFixed(4)}i`;
}

const STATEVECTOR_DEFAULT_LIMIT = 64;

export function StatevectorPanel({ state }: Props) {
  const [hideZeros, setHideZeros] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const data = dataOf(state);
  const error = state.kind === "error" ? state.message : null;

  const copy = () => {
    if (!data) return "";
    const terms = data.amplitudes
      .filter((a) => !a.isZero)
      .map((a) => `(${formatComplex(a.re, a.im)}) |${a.basis}>`);
    return terms.length ? "|psi> = " + terms.join(" + ") : "|psi> = 0";
  };

  /**
   * Download the full statevector — `csv` writes a row-per-basis CSV
   * (basis, re, im, prob); `json` writes a JSON object with the raw amplitude
   * array. Skipped on stabilizer/noisy paths because there's no single ket.
   */
  const downloadStatevector = (fmt: "csv" | "json") => {
    if (!data || data.isStabilizer || data.isNoisy) return;
    const rows = data.amplitudes;
    let blob: Blob;
    let filename: string;
    if (fmt === "csv") {
      const lines = ["basis,re,im,probability"];
      for (const a of rows) {
        lines.push(`${a.basis},${a.re},${a.im},${a.re * a.re + a.im * a.im}`);
      }
      blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
      filename = "statevector.csv";
    } else {
      const obj = {
        numQubits: data.numQubits,
        amplitudes: rows.map((a) => ({ basis: a.basis, re: a.re, im: a.im })),
      };
      blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
      filename = "statevector.json";
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const canExport = !!data && !data.isNoisy && !data.isStabilizer;

  return (
    <PanelShell
      id="statevector"
      title="Statevector"
      getCopyText={copy}
      toolbar={
        <>
          <label className="panel__toggle">
            <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
            hide 0's
          </label>
          {canExport && (
            <>
              <button
                onClick={() => downloadStatevector("csv")}
                title="Download the statevector as CSV (basis, re, im, |amp|²)"
              >
                CSV
              </button>
              <button
                onClick={() => downloadStatevector("json")}
                title="Download the statevector as JSON"
              >
                JSON
              </button>
            </>
          )}
        </>
      }
    >
      {error && <div className="panel__error">{error}</div>}
      {data?.isNoisy && (
        <div className="panel__notice">
          Noise mode on — the state is mixed, no single ket represents it.
          See the Probabilities and Bloch panels for averaged readouts
          ({data.trajectories} trajectories).
        </div>
      )}
      {data?.isStabilizer && (
        <div className="panel__notice">
          Clifford fast path ({data.numQubits} qubits). The full statevector
          has 2<sup>{data.numQubits}</sup> amplitudes and isn't materialised;
          the tableau represents the same state in O(n²) memory. Bloch panel
          gives the exact per-qubit reduced state.
        </div>
      )}
      {data && !data.isNoisy && !data.isStabilizer && (() => {
        const visible = data.amplitudes.filter((a) => !hideZeros || !a.isZero);
        const total = visible.length;
        const cap = showAll ? Infinity : STATEVECTOR_DEFAULT_LIMIT;
        const overflowed = total > cap;
        const rows = overflowed ? visible.slice(0, cap) : visible;
        return (
        <>
          <table className="statevector__table">
            <thead>
              <tr>
                <th>basis</th>
                <th>amplitude</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                  <tr key={a.index} className={a.isZero ? "statevector__row--zero" : ""}>
                    <td className="statevector__basis">
                      <Tex latex={`|${a.basis}\\rangle`} />
                    </td>
                    <td>
                      <span className="statevector__numeric">{formatComplex(a.re, a.im)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {overflowed && (
            <button
              onClick={() => setShowAll((v) => !v)}
              title={showAll ? `Cap at ${STATEVECTOR_DEFAULT_LIMIT} rows` : `Show all ${total} rows`}
              style={{ marginTop: 4 }}
            >
              {showAll ? `Cap at ${STATEVECTOR_DEFAULT_LIMIT}` : `Show all ${total} rows`}
            </button>
          )}
          {data.measurementRecord && data.measurementRecord.length > 0 && (
            <div className="statevector__measurements">
              <span className="statevector__measurements-head">classical</span>
              <span className="statevector__measurements-bits">
                {data.measurementRecord.map((b, i) => (
                  <span key={i} className="statevector__cbit">
                    c{i}={b}
                  </span>
                ))}
              </span>
            </div>
          )}
          {data.skipped.length > 0 && (
            <div className="statevector__skipped">
              <div className="statevector__skipped-head">Skipped</div>
              <ul>
                {data.skipped.map((s) => (
                  <li key={s.id}>
                    <code>{s.gateId}</code> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
        );
      })()}
    </PanelShell>
  );
}
