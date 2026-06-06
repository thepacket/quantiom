import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { diagonalEnsemble, MAX_DIAGENS_QUBITS, type DiagonalEnsembleResult } from "../sim/diagonalEnsemble";

type Props = { state: SimState };

const PRESETS: Record<string, string> = {
  "Tilted Ising (chaotic, 3q)": "-1*ZZI - 1*IZZ + 0.9045*XII + 0.9045*IXI + 0.9045*IIX + 0.809*ZII + 0.809*IZI + 0.809*IIZ",
  "Transverse Ising (3q)": "-1*ZZI - 1*IZZ - 1*XII - 1*IXI - 1*IIX",
  "Heisenberg (3q)": "1*XXI + 1*IXX + 1*YYI + 1*IYY + 1*ZZI + 1*IZZ",
};

/**
 * Diagonal ensemble / ETH: decompose the current state in the energy
 * eigenbasis of a Pauli-sum H and plot the populations p_k = |⟨E_k|ψ⟩|²
 * vs energy. These are the weights of the infinite-time-averaged state ρ_DE —
 * a thermalizing state spreads over many eigenstates in a narrow energy
 * window (large d_eff); an eigenstate is a single spike. Shows ⟨H⟩, the
 * energy spread, and the effective dimension. n ≤ 6, default-collapsed.
 */
export function DiagonalEnsemblePanel({ state }: Props) {
  return (
    <PanelShell id="diagonal-ensemble" title="Diagonal ensemble (ETH)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [text, setText] = useState(PRESETS["Tilted Ising (chaotic, 3q)"]);

  const parsed = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || n < 1 || n > MAX_DIAGENS_QUBITS) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const hn = pauliSumQubitCount(terms);
      if (hn !== n) return { error: `H is on ${hn} qubits but the circuit has ${n} — match them` };
      const res = diagonalEnsemble(terms, data.state, n);
      if (!res) return { error: "could not diagonalise" };
      return { res };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, data, n, text]) as
    | null
    | { error: string; res?: undefined }
    | { error?: undefined; res: DiagonalEnsembleResult };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the statevector.</div>;
  if (n > MAX_DIAGENS_QUBITS)
    return <div className="panel__notice">{n} qubits — the diagonal ensemble is capped at {MAX_DIAGENS_QUBITS}.</div>;

  return (
    <div className="dens">
      <div className="dens__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="dens__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="dens__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="H as a Pauli sum, e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.res && <Plot r={parsed.res} />}
    </div>
  );
}

const W = 300;
const H = 130;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

function Plot({ r }: { r: DiagonalEnsembleResult }) {
  const { energies, populations, meanEnergy, energySpread, effectiveDim, dim } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const eLo = energies[0];
  const eHi = energies[energies.length - 1];
  const span = eHi - eLo || 1;
  const pMax = Math.max(1e-9, ...populations);
  const xOf = (e: number) => PAD_L + ((e - eLo) / span) * plotW;
  const yOf = (p: number) => PAD_T + (1 - p / pMax) * plotH;
  const meanX = xOf(meanEnergy);

  return (
    <div className="dens__out">
      <div className="dens__stats">
        <span>⟨H⟩ = <b>{meanEnergy.toFixed(3)}</b></span>
        <span>ΔE = <b>{energySpread.toFixed(3)}</b></span>
        <span>d_eff = <b>{effectiveDim.toFixed(1)}</b> / {dim}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dens__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="dens__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="dens__axis-line" />
        {/* stems */}
        {energies.map((e, k) => (
          <g key={k}>
            <line x1={xOf(e)} y1={H - PAD_B} x2={xOf(e)} y2={yOf(populations[k])} className="dens__stem" />
            <circle cx={xOf(e)} cy={yOf(populations[k])} r={1.7} className="dens__dot" />
          </g>
        ))}
        {/* mean energy marker */}
        <line x1={meanX} y1={PAD_T} x2={meanX} y2={H - PAD_B} className="dens__mean" />
        <text x={meanX} y={PAD_T + 7} textAnchor="middle" className="dens__axis">⟨H⟩</text>
        {/* ticks */}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="dens__axis">{pMax.toFixed(2)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="dens__axis">0</text>
        <text x={PAD_L} y={H - 6} textAnchor="start" className="dens__axis">{eLo.toFixed(1)}</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="dens__axis">{eHi.toFixed(1)}</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="dens__axis">energy →</text>
      </svg>
      <div className="dens__legend">pₖ = |⟨Eₖ|ψ⟩|² · large d_eff over a narrow window ⇒ thermalizing</div>
    </div>
  );
}
