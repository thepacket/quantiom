import { useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { Tex } from "./Tex";
import { PanelShell } from "./PanelShell";

type Props = { state: SimState };

export function StatevectorPanel({ state }: Props) {
  const [hideZeros, setHideZeros] = useState(true);

  const data = dataOf(state);
  const loading = state.kind === "loading";
  const error = state.kind === "error" ? state.message : null;

  return (
    <PanelShell
      id="statevector"
      title="Statevector"
      toolbar={
        <>
          <label className="panel__toggle">
            <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
            hide zeros
          </label>
          <span className="panel__spinner" style={{ visibility: loading ? "visible" : "hidden" }}>…</span>
        </>
      }
    >
      {error && <div className="panel__error">{error}</div>}
      {data && (
        <>
          <div className="statevector__ket">
            <Tex latex={`|\\psi\\rangle = ${data.ketLatex}`} display />
          </div>
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
                      <Tex latex={a.latex} />
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
      {!data && !error && <div className="panel__placeholder">building circuit…</div>}
    </PanelShell>
  );
}
