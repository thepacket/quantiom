import { useRef, useState } from "react";
import { PanelShell } from "./PanelShell";
import { equivalenceCheck, type EquivalenceResult } from "../sim/equivalence";
import { parseQasm3 } from "../qasm/parse";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  /** Optional list of other tabs the user can pick to compare against,
   *  instead of loading a file. Each entry is (id, label, circuit). */
  otherTabs?: Array<{ id: string; label: string; circuit: Circuit }>;
};

/**
 * Equivalence check between the current circuit and a loaded .qasm file.
 * Default-collapsed; the check runs on-demand (clicking the Compare button
 * after a file is loaded). Heavy computation only happens on the click.
 */
export function EquivalencePanel(props: Props) {
  return (
    <PanelShell id="equivalence" title="Equivalence check" defaultCollapsed>
      <EquivalenceBody {...props} />
    </PanelShell>
  );
}

function EquivalenceBody({ circuit, customGates, paramValues, otherTabs }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [other, setOther] = useState<{ name: string; circuit: Circuit } | null>(null);
  const [result, setResult] = useState<EquivalenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = parseQasm3(text);
      if (!parsed.ok) {
        setError(`parse error on line ${parsed.line}: ${parsed.error}`);
        setOther(null);
        return;
      }
      const name = f.name.replace(/\.qasm$/i, "");
      setOther({ name, circuit: { ...parsed.circuit, name } });
      setError(null);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const run = () => {
    if (!other) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const r = equivalenceCheck(
          circuit,
          other.circuit,
          customGates,
          [],
          paramValues,
        );
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  const clear = () => {
    setOther(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="equiv">
      <input
        ref={fileRef}
        type="file"
        accept=".qasm,.txt"
        style={{ display: "none" }}
        onChange={onFile}
      />
      {!other ? (
        <>
          <div className="equiv__source">
            <button className="equiv__load" onClick={load}>Load comparison .qasm…</button>
            {otherTabs && otherTabs.length > 0 && (
              <select
                className="equiv__tabs"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const tab = otherTabs.find((t) => t.id === id);
                  if (tab) setOther({ name: tab.label, circuit: tab.circuit });
                  setError(null);
                  setResult(null);
                  e.target.value = "";
                }}
              >
                <option value="">…or pick another tab</option>
                {otherTabs.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
          </div>
          <p className="panel__placeholder">
            Compare the current circuit against a second one. Computes either
            the full 2ⁿ × 2ⁿ unitary (n ≤ 8) or 16 sampled columns (n &gt; 8),
            and reports equivalence up to global phase plus process fidelity
            F and a trace-distance bound.
          </p>
        </>
      ) : (
        <>
          <div className="equiv__pair">
            <div className="equiv__side"><span>A</span> {circuit.name ?? "Untitled"}</div>
            <div className="equiv__side"><span>B</span> {other.name}</div>
          </div>
          <div className="equiv__actions">
            <button className="equiv__run" onClick={run} disabled={busy}>
              {busy ? "Comparing…" : "Compare"}
            </button>
            <button className="equiv__clear" onClick={clear}>Clear</button>
          </div>
        </>
      )}

      {error && <div className="panel__error">{error}</div>}

      {result && (
        <div className={"equiv__result " + (result.equivalent ? "equiv__result--ok" : "equiv__result--fail")}>
          <div className="equiv__verdict">
            {result.equivalent ? "✓ Equivalent" : "✗ Not equivalent"}
            {" "}
            <span className="equiv__detail">
              ({result.exact ? "exact, " : "sampled "}{result.sampledColumns} columns)
            </span>
          </div>
          <div className="equiv__metrics">
            <div>max |Δa| = {result.maxDeviation.toExponential(2)}</div>
            <div>process fidelity F = {result.processFidelity.toFixed(6)}</div>
            <div>trace distance ≤ {result.traceDistanceProxy.toFixed(4)}</div>
            <div>global phase φ = {(result.globalPhase * 180 / Math.PI).toFixed(2)}°</div>
            {!result.equivalent && result.worstColumn >= 0 && (
              <div>
                largest at column |
                {result.worstColumn.toString(2).padStart(circuit.numQubits, "0")}⟩,
                row |
                {result.worstRow.toString(2).padStart(circuit.numQubits, "0")}⟩
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
