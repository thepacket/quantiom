import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { diagonalEnsemble, MAX_DIAGENS_QUBITS } from "../sim/diagonalEnsemble";
import { effectiveTemperature, type EffectiveTempResult } from "../sim/effectiveTemperature";

type Props = { state: SimState };

const PRESETS: Record<string, string> = {
  "TFIM (3 spins)": "-1*ZZI - 1*IZZ - 0.5*XII - 0.5*IXI - 0.5*IIX",
  "Heisenberg (3)": "1*XXI+1*YYI+1*ZZI+1*IXX+1*IYY+1*IZZ",
  "Single field": "1*Z + 0.5*X",
};

/**
 * Effective temperature (ETH) — fits a Boltzmann law p_k ∝ e^{−βE_k} to the
 * diagonal-ensemble energy populations of the current state under a chosen
 * Hamiltonian. A straight line in ln p vs E (high R²) is evidence of
 * eigenstate thermalisation; the slope gives β (and T = 1/β). Statevector
 * path, n ≤ 6, default-collapsed.
 */
export function EffectiveTemperaturePanel({ state }: Props) {
  return (
    <PanelShell id="effective-temperature" title="Effective temperature (ETH)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const [text, setText] = useState(PRESETS["TFIM (3 spins)"]);

  const parsed = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const need = pauliSumQubitCount(terms);
      if (need !== data.numQubits) return { error: `H acts on ${need} qubits but the circuit has ${data.numQubits}` };
      if (data.numQubits > MAX_DIAGENS_QUBITS) return { error: `${data.numQubits} qubits — capped at ${MAX_DIAGENS_QUBITS}` };
      const diag = diagonalEnsemble(terms, data.state, data.numQubits);
      if (!diag) return { error: "could not diagonalise" };
      return { fit: effectiveTemperature(diag) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, text, data]) as
    | null
    | { error: string; fit?: undefined }
    | { error?: undefined; fit: EffectiveTempResult };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode for the energy populations.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — uses the pure-state energy populations.</div>;

  return (
    <div className="efftemp">
      <div className="efftemp__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="efftemp__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea className="efftemp__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false} />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.fit && <Plot r={parsed.fit} />}
    </div>
  );
}

const W = 300;
const H = 120;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;

function Plot({ r }: { r: EffectiveTempResult }) {
  const { energies, logPop, beta, temperature, r2, intercept } = r;
  const pts = energies.map((e, k) => ({ e, lp: logPop[k] })).filter((p) => Number.isFinite(p.lp));
  if (pts.length < 2) return <div className="panel__placeholder">not enough populated levels for a fit.</div>;
  const eMin = Math.min(...pts.map((p) => p.e));
  const eMax = Math.max(...pts.map((p) => p.e));
  const lpMin = Math.min(...pts.map((p) => p.lp));
  const lpMax = Math.max(...pts.map((p) => p.lp));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (e: number) => PAD_L + ((e - eMin) / (eMax - eMin || 1)) * plotW;
  const yOf = (lp: number) => PAD_T + (1 - (lp - lpMin) / (lpMax - lpMin || 1)) * plotH;
  return (
    <div className="efftemp__out">
      <div className="efftemp__stats">
        <span>β = <b>{beta.toFixed(3)}</b></span>
        <span>T = <b>{Number.isFinite(temperature) ? temperature.toFixed(3) : "∞"}</b></span>
        <span>R² = <b>{r2.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="efftemp__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="efftemp__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="efftemp__axis-line" />
        <line x1={xOf(eMin)} y1={yOf(intercept - beta * eMin)} x2={xOf(eMax)} y2={yOf(intercept - beta * eMax)} className="efftemp__fit" />
        {pts.map((p, i) => <circle key={i} cx={xOf(p.e)} cy={yOf(p.lp)} r={2.4} className="efftemp__dot"><title>E={p.e.toFixed(3)}, ln p={p.lp.toFixed(2)}</title></circle>)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="efftemp__axis">ln p</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="efftemp__axis">energy E →</text>
      </svg>
      <div className="efftemp__legend">ln p_k vs E_k · straight line (high R²) ⇒ thermal (Boltzmann), slope = −β</div>
    </div>
  );
}
