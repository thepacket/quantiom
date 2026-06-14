import { useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { hamiltonianSpectrum } from "../sim/hamSpectrum";
import { densityOfStates, type DosResult } from "../sim/densityOfStates";

const MAX_QUBITS = 7;

const PRESETS: Record<string, string> = {
  "TFIM (4 spins)": "-1*ZZII - 1*IZZI - 1*IIZZ - 0.6*XIII - 0.6*IXII - 0.6*IIXI - 0.6*IIIX",
  "Heisenberg (4)": "1*XXII+1*YYII+1*ZZII+1*IXXI+1*IYYI+1*IZZI+1*IIXX+1*IIYY+1*IIZZ",
  "TFIM (3 spins)": "-1*ZZI - 1*IZZ - 0.5*XII - 0.5*IXI - 0.5*IIX",
};

/**
 * Density of states — a histogram of the exact energy spectrum of a Pauli-sum
 * Hamiltonian. Coarse-grains the individual levels so the spectrum's shape is
 * legible: the Gaussian bulk of a generic many-body H, spectral edges, gaps,
 * and degeneracy spikes (the DOS shape underlies the SFF / level-statistics
 * diagnostics). On-demand diagonalisation, n ≤ 7, default-collapsed.
 */
export function DensityOfStatesPanel() {
  return (
    <PanelShell id="density-of-states" title="Density of states" defaultCollapsed>
      <Body />
    </PanelShell>
  );
}

function Body() {
  const collapsed = usePanelCollapsed();
  const [text, setText] = useState(PRESETS["TFIM (4 spins)"]);

  const parsed = useMemo(() => {
    if (collapsed) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const n = pauliSumQubitCount(terms);
      if (n > MAX_QUBITS) return { error: `${n} qubits — capped at ${MAX_QUBITS}` };
      const spec = hamiltonianSpectrum(terms, n, MAX_QUBITS);
      if (!spec) return { error: "could not diagonalise" };
      const dos = densityOfStates(spec.energies, Math.min(28, 1 << n));
      if (!dos) return { error: "no spectrum" };
      return { dos, n };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, text]) as
    | null
    | { error: string; dos?: undefined }
    | { error?: undefined; dos: DosResult; n: number };

  return (
    <div className="dos">
      <div className="dos__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="dos__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="dos__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.dos && <Hist dos={parsed.dos} n={parsed.n} />}
    </div>
  );
}

const W = 300;
const H = 120;
const PAD_B = 18;

function Hist({ dos, n }: { dos: DosResult; n: number }) {
  const { centers, counts, eMin, eMax, total } = dos;
  const max = Math.max(1, ...counts);
  const bw = Math.max(2, (W - 4) / counts.length - 1);
  return (
    <div className="dos__out">
      <div className="dos__stats">
        <span>{total} levels ({n}q)</span>
        <span>E ∈ [<b>{eMin.toFixed(2)}</b>, <b>{eMax.toFixed(2)}</b>]</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dos__svg plot-fill" role="img">
        <line x1={0} y1={H - PAD_B} x2={W} y2={H - PAD_B} className="dos__axis-line" />
        {counts.map((c, i) => {
          const h = (c / max) * (H - PAD_B - 4);
          const x = 2 + i * (bw + 1);
          return (
            <rect key={i} x={x} y={H - PAD_B - h} width={bw} height={h} className="dos__bar">
              <title>E ≈ {centers[i].toFixed(3)}: {c} levels</title>
            </rect>
          );
        })}
        <text x={2} y={H - 4} className="dos__axis">{eMin.toFixed(1)}</text>
        <text x={W - 2} y={H - 4} textAnchor="end" className="dos__axis">{eMax.toFixed(1)}</text>
        <text x={W / 2} y={H - 4} textAnchor="middle" className="dos__axis">energy →</text>
      </svg>
      <div className="dos__legend">count of eigenvalues per energy bin · Gaussian bulk ⇒ generic many-body spectrum</div>
    </div>
  );
}
