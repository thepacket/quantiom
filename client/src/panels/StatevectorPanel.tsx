import { useEffect, useRef, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { Tex } from "./Tex";
import { PanelShell } from "./PanelShell";
import { fetchSymbolic } from "../api";
import type { Circuit } from "../editor/types";

type Props = { state: SimState; circuit: Circuit };

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

type SymState =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "ready"; latex: string }
  | { kind: "too-large" }
  | { kind: "error"; message: string };

export function StatevectorPanel({ state, circuit }: Props) {
  const [hideZeros, setHideZeros] = useState(true);
  const [sym, setSym] = useState<SymState>({ kind: "off" });
  const lastCircuitRef = useRef<Circuit>(circuit);

  // Clear the symbolic display whenever the circuit changes — the cached
  // expression no longer matches what the user is looking at.
  useEffect(() => {
    if (lastCircuitRef.current !== circuit) {
      lastCircuitRef.current = circuit;
      if (sym.kind !== "off") setSym({ kind: "off" });
    }
  }, [circuit, sym.kind]);

  const onSym = async () => {
    setSym({ kind: "loading" });
    try {
      const res = await fetchSymbolic(circuit);
      if (res.tooLarge) setSym({ kind: "too-large" });
      else setSym({ kind: "ready", latex: res.ketLatex });
    } catch (e) {
      setSym({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const data = dataOf(state);
  const loading = state.kind === "loading";
  const error = state.kind === "error" ? state.message : null;

  const copy = () => {
    if (sym.kind === "ready") return `|\\psi\\rangle = ${sym.latex}`;
    if (!data) return "";
    const terms = data.amplitudes
      .filter((a) => !a.isZero && a.re !== null && a.im !== null)
      .map((a) => `(${formatComplex(a.re!, a.im!)}) |${a.basis}>`);
    return terms.length ? "|psi> = " + terms.join(" + ") : "|psi> = 0";
  };

  return (
    <PanelShell
      id="statevector"
      title="Statevector"
      getCopyText={copy}
      toolbar={
        <>
          <button
            className={"panel__small" + (sym.kind === "ready" ? " panel__small--on" : "")}
            onClick={onSym}
            disabled={sym.kind === "loading"}
            title="Compute and show the symbolic |ψ⟩ once for the current circuit"
          >
            {sym.kind === "loading" ? "…" : "sym"}
          </button>
          <label className="panel__toggle">
            <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
            hide zeros
          </label>
          <span className="panel__spinner" style={{ visibility: loading ? "visible" : "hidden" }}>…</span>
        </>
      }
    >
      {error && <div className="panel__error">{error}</div>}
      {sym.kind === "ready" && (
        <div className="statevector__ket">
          <Tex latex={`|\\psi\\rangle = ${sym.latex}`} display />
        </div>
      )}
      {sym.kind === "too-large" && (
        <div className="statevector__note">circuit too large for symbolic display (≤ 12 gates and ≤ 4 qubits)</div>
      )}
      {sym.kind === "error" && (
        <div className="panel__error">{sym.message}</div>
      )}
      {data && (
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
                      {a.re !== null && a.im !== null ? (
                        <span className="statevector__numeric">{formatComplex(a.re, a.im)}</span>
                      ) : (
                        <span className="statevector__numeric">—</span>
                      )}
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
