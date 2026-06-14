import { useState } from "react";
import { PanelShell } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { ethOffDiagonal, type EthResult } from "../sim/ethOffDiagonal";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };
const MAX_QUBITS = 5;

const H_PRESETS: Record<string, string> = {
  "TFIM (4 spins)": "-1*ZZII - 1*IZZI - 1*IIZZ - 0.9*XIII - 0.9*IXII - 0.9*IIXI - 0.9*IIIX",
  "Heisenberg (3)": "1*XXI+1*YYI+1*ZZI+1*IXX+1*IYY+1*IZZ",
  "Integrable XX (4)": "1*XXII+1*YYII+1*IXXI+1*IYYI+1*IIXX+1*IIYY",
};

/**
 * ETH off-diagonal matrix elements — scatters |⟨E_m|O|E_n⟩|² against the energy
 * difference ω = E_m − E_n for a Hamiltonian H and an observable O. A
 * thermalising H shows a smooth, small-magnitude envelope (the ETH f(ω)); an
 * integrable / MBL H shows sparse, large, structured elements. The diagonal
 * ⟨E_n|O|E_n⟩ vs E is drawn too. On-demand, n ≤ 5.
 */
export function EthOffDiagonalPanel({ circuit }: Props) {
  return (
    <PanelShell id="eth-offdiagonal" title="ETH off-diagonal elements" defaultCollapsed>
      <Body circuit={circuit} />
    </PanelShell>
  );
}

function Body({ circuit }: Props) {
  const n = circuit.numQubits;
  const [hText, setHText] = useState(H_PRESETS["TFIM (4 spins)"]);
  const [oText, setOText] = useState("1*ZIII");
  const [result, setResult] = useState<EthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setError(null);
    setTimeout(() => {
      try {
        const h = parsePauliSum(hText);
        const o = parsePauliSum(oText);
        if (h.length === 0 || o.length === 0) { setError("enter both H and O"); setBusy(false); return; }
        const nH = pauliSumQubitCount(h), nO = pauliSumQubitCount(o);
        const need = Math.max(nH, nO);
        if (need > MAX_QUBITS) { setError(`${need} qubits — capped at ${MAX_QUBITS}`); setBusy(false); return; }
        const r = ethOffDiagonal(h, o, need, MAX_QUBITS);
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
    <div className="eth">
      <div className="eth__presets">
        {Object.keys(H_PRESETS).map((name) => (
          <button key={name} className="eth__preset" onClick={() => setHText(H_PRESETS[name])}>{name}</button>
        ))}
      </div>
      <label className="eth__lbl">H<textarea className="eth__input" value={hText} onChange={(e) => setHText(e.target.value)} rows={2} spellCheck={false} /></label>
      <label className="eth__lbl">O<textarea className="eth__input" value={oText} onChange={(e) => setOText(e.target.value)} rows={1} spellCheck={false} placeholder="observable, e.g. 1*ZIII" /></label>
      <div className="eth__actions">
        <button className="eth__run" onClick={run} disabled={busy}>{busy ? "Diagonalising…" : "Run"}</button>
        <span className="eth__hint">circuit has {n} qubit{n === 1 ? "" : "s"}</span>
      </div>
      {error && <div className="panel__notice">{error}</div>}
      {result && <Scatter r={result} />}
    </div>
  );
}

const W = 300;
const H = 130;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;

function Scatter({ r }: { r: EthResult }) {
  const { offDiag, diag, meanOffDiag } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const omegaMax = Math.max(...offDiag.map((p) => Math.abs(p.omega)), 1e-9);
  const mag2Max = Math.max(...offDiag.map((p) => p.mag2), ...diag.map((d) => d.value * d.value), 1e-12);
  const xOf = (omega: number) => PAD_L + ((omega + omegaMax) / (2 * omegaMax)) * plotW;
  const yOf = (m: number) => PAD_T + (1 - Math.min(1, m / mag2Max)) * plotH;
  return (
    <div className="eth__out">
      <div className="eth__stats">
        <span>⟨|O_mn|²⟩ = <b>{meanOffDiag.toExponential(2)}</b></span>
        <span>{offDiag.length} pts</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="eth__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="eth__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="eth__axis-line" />
        <line x1={xOf(0)} y1={PAD_T} x2={xOf(0)} y2={H - PAD_B} className="eth__zero" />
        {offDiag.map((p, i) => <circle key={i} cx={xOf(p.omega)} cy={yOf(p.mag2)} r={1.1} className="eth__dot" />)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="eth__axis">|O_mn|²</text>
        <text x={xOf(0)} y={H - 6} textAnchor="middle" className="eth__axis">ω = 0</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="eth__axis">ω →</text>
      </svg>
      <div className="eth__legend">|⟨E_m|O|E_n⟩|² vs ω · smooth small envelope ⇒ ETH/thermal, sparse large ⇒ integrable</div>
    </div>
  );
}
