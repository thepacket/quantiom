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

export function StatevectorPanel({ state }: Props) {
  const [hideZeros, setHideZeros] = useState(true);

  const data = dataOf(state);
  const error = state.kind === "error" ? state.message : null;

  const copy = () => {
    if (!data) return "";
    const terms = data.amplitudes
      .filter((a) => !a.isZero)
      .map((a) => `(${formatComplex(a.re, a.im)}) |${a.basis}>`);
    return terms.length ? "|psi> = " + terms.join(" + ") : "|psi> = 0";
  };

  return (
    <PanelShell
      id="statevector"
      title="Statevector"
      getCopyText={copy}
      toolbar={
        <label className="panel__toggle">
          <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
          hide zeros
        </label>
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
      {data && !data.isNoisy && !data.isStabilizer && (
        <>
          <table className="statevector__table">
            <thead>
              <tr>
                <th>basis</th>
                <th>amplitude</th>
              </tr>
            </thead>
            <tbody>
              {data.amplitudes
                .filter((a) => !hideZeros || !a.isZero)
                .map((a) => (
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
      )}
    </PanelShell>
  );
}
