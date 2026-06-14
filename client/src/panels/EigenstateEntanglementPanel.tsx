import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { eigenstateEntanglement, type EigenstateEntResult } from "../sim/eigenstateEntanglement";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };
const MAX_QUBITS = 6;

const PRESETS: Record<string, string> = {
  "TFIM (4, thermal)": "-1*ZZII - 1*IZZI - 1*IIZZ - 0.9*XIII - 0.9*IXII - 0.9*IIXI - 0.9*IIIX",
  "Heisenberg (4)": "1*XXII+1*YYII+1*ZZII+1*IXXI+1*IYYI+1*IZZI+1*IIXX+1*IIYY+1*IIZZ",
  "Integrable XX (4)": "1*XXII+1*YYII+1*IXXI+1*IYYI+1*IIXX+1*IIYY",
};

/**
 * Eigenstate entanglement entropy — the half-chain S(ρ_A) of every energy
 * eigenstate of a Pauli-sum H, scattered against energy. A thermalizing H
 * (ETH) shows a volume-law arch peaking mid-spectrum near the Page ceiling; an
 * integrable / MBL H shows low, scattered area-law points. On-demand, n ≤ 6.
 */
export function EigenstateEntanglementPanel({ circuit }: Props) {
  return (
    <PanelShell id="eigenstate-entanglement" title="Eigenstate entanglement (ETH)" defaultCollapsed>
      <Body circuit={circuit} />
    </PanelShell>
  );
}

function Body({ circuit }: Props) {
  const n = circuit.numQubits;
  const [text, setText] = useState(PRESETS["TFIM (4, thermal)"]);
  const [result, setResult] = useState<EigenstateEntResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const terms = parsePauliSum(text);
        if (terms.length === 0) { setError("no terms"); setBusy(false); return; }
        const need = pauliSumQubitCount(terms);
        if (need > MAX_QUBITS) { setError(`${need} qubits — capped at ${MAX_QUBITS}`); setBusy(false); return; }
        const r = eigenstateEntanglement(terms, need, MAX_QUBITS);
        if (!r) setError("could not diagonalise");
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  return (
    <div className="eigent">
      <div className="eigent__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="eigent__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea className="eigent__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false} />
      <div className="eigent__actions">
        <button className="eigent__run" onClick={run} disabled={busy}>{busy ? "Diagonalising…" : "Run"}</button>
        <span className="eigent__hint">circuit has {n} qubit{n === 1 ? "" : "s"}</span>
      </div>
      {error && <div className="panel__notice">{error}</div>}
      {result && <Scatter r={result} />}
    </div>
  );
}

const W = 300;
const H = 130;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;

function Scatter({ r }: { r: EigenstateEntResult }) {
  const { energies, entropies, maxEntropy } = r;
  const eMin = Math.min(...energies), eMax = Math.max(...energies);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (e: number) => PAD_L + ((e - eMin) / (eMax - eMin || 1)) * plotW;
  const yOf = (s: number) => PAD_T + (1 - s / (maxEntropy || 1)) * plotH;
  const meanS = entropies.reduce((a, b) => a + b, 0) / (entropies.length || 1);
  return (
    <div className="eigent__out">
      <div className="eigent__stats">
        <span>⟨S⟩ = <b>{meanS.toFixed(3)}</b> / {maxEntropy} bit</span>
        <span>{energies.length} eigenstates</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="eigent__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="eigent__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="eigent__axis-line" />
        <line x1={PAD_L} y1={yOf(maxEntropy)} x2={W - PAD_R} y2={yOf(maxEntropy)} className="eigent__ceiling" />
        {energies.map((e, k) => <circle key={k} cx={xOf(e)} cy={yOf(entropies[k])} r={1.8} className="eigent__dot"><title>E={e.toFixed(3)}, S={entropies[k].toFixed(3)}</title></circle>)}
        <text x={PAD_L - 4} y={yOf(maxEntropy) + 3} textAnchor="end" className="eigent__axis">{maxEntropy}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="eigent__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="eigent__axis">energy E →</text>
      </svg>
      <div className="eigent__legend">S(ρ_A) of each eigenstate vs E · volume-law arch ⇒ ETH/thermal, low &amp; flat ⇒ MBL/integrable</div>
    </div>
  );
}
