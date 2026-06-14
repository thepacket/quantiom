import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { observableMoments, shotError } from "../sim/observableVariance";

type Props = { state: SimState };

const PRESETS: Record<string, string> = {
  "TFIM (3 spins)": "-1*ZZI - 1*IZZ - 0.5*XII - 0.5*IXI - 0.5*IIX",
  "Heisenberg (2 spins)": "1*XX + 1*YY + 1*ZZ",
  "H₂ (minimal, 2q)": "-1.0523*II + 0.3979*IZ - 0.3979*ZI - 0.0113*ZZ + 0.1809*XX",
  "Single Z": "1*Z",
};

const SHOTS = [100, 1000, 10000, 100000];

/**
 * Observable variance and shot-noise error for a Pauli-sum H = Σ h_k P_k:
 * ⟨H⟩, Var(H) = ⟨H²⟩ − ⟨H⟩², the standard deviation σ, and the standard error
 * σ/√N of an N-shot estimate. Makes the exact Expectation panel honest about
 * the measurement cost a VQE energy evaluation actually pays. Statevector
 * path, default-collapsed.
 */
export function ObservableVariancePanel({ state }: Props) {
  return (
    <PanelShell id="observable-variance" title="Observable variance & shot noise" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const [text, setText] = useState(PRESETS["TFIM (3 spins)"]);
  const [shots, setShots] = useState(1000);

  const parsed = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const need = pauliSumQubitCount(terms);
      if (need > data.numQubits)
        return { error: `H acts on ${need} qubits but the circuit has ${data.numQubits}` };
      const m = observableMoments(data.state, data.numQubits, terms);
      return { m };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, data, text]) as
    | null
    | { error: string; m?: undefined }
    | { error?: undefined; m: { mean: number; variance: number; std: number } };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode for ⟨H⟩ moments.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — use the Expectation panel's noisy ⟨P⟩ instead.</div>;

  return (
    <div className="ovar">
      <div className="ovar__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="ovar__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="ovar__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.m && (
        <div className="ovar__out">
          <div className="ovar__stats">
            <span>⟨H⟩ = <b>{parsed.m.mean.toFixed(5)}</b></span>
            <span>Var(H) = <b>{parsed.m.variance.toFixed(5)}</b></span>
            <span>σ = <b>{parsed.m.std.toFixed(5)}</b></span>
          </div>
          <div className="ovar__shots">
            <span className="ovar__shots-label">shots N:</span>
            {SHOTS.map((s) => (
              <button key={s} className={"ovar__shot" + (s === shots ? " ovar__shot--on" : "")} onClick={() => setShots(s)}>
                {s >= 1000 ? `${s / 1000}k` : s}
              </button>
            ))}
          </div>
          <div className="ovar__err">
            ⟨H⟩ = {parsed.m.mean.toFixed(4)} ± <b>{shotError(parsed.m.std, shots).toFixed(4)}</b>
            <span className="ovar__err-note"> (1σ standard error at N = {shots.toLocaleString()})</span>
          </div>
        </div>
      )}
    </div>
  );
}
