import { useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { hamiltonianSpectrum } from "../sim/hamSpectrum";
import { levelStatistics, POISSON_R, GOE_R, type LevelStatsResult } from "../sim/levelStatistics";

const MAX_QUBITS = 6;

const PRESETS: Record<string, string> = {
  // Tilted-field Ising with a longitudinal-field GRADIENT — the gradient breaks
  // the chain's reflection symmetry so a single sector is probed: clean GOE.
  "Tilted Ising + gradient (chaotic, 6q)":
    "-1*ZZIIII - 1*IZZIII - 1*IIZZII - 1*IIIZZI - 1*IIIIZZ + 0.9045*XIIIII + 0.9045*IXIIII + 0.9045*IIXIII + 0.9045*IIIXII + 0.9045*IIIIXI + 0.9045*IIIIIX + 0.809*ZIIIII + 0.849*IZIIII + 0.889*IIZIII + 0.929*IIIZII + 0.969*IIIIZI + 1.009*IIIIIZ",
  // Same model WITHOUT the gradient: reflection-symmetric, so two symmetry
  // sectors superpose and ⟨r⟩ collapses toward Poisson — the caveat in action.
  "Symmetric tilted Ising (Poisson-like, 6q)":
    "-1*ZZIIII - 1*IZZIII - 1*IIZZII - 1*IIIZZI - 1*IIIIZZ + 0.9045*XIIIII + 0.9045*IXIIII + 0.9045*IIXIII + 0.9045*IIIXII + 0.9045*IIIIXI + 0.9045*IIIIIX + 0.809*ZIIIII + 0.809*IZIIII + 0.809*IIZIII + 0.809*IIIZII + 0.809*IIIIZI + 0.809*IIIIIZ",
  "Heisenberg (3q)": "1*XXI + 1*IXX + 1*YYI + 1*IYY + 1*ZZI + 1*IZZ",
};

/**
 * Level-spacing statistics: the Oganesyan–Huse gap ratio
 * rₙ = min(δₙ,δₙ₋₁)/max(δₙ,δₙ₋₁) of a Pauli-sum Hamiltonian's spectrum — the
 * energy-domain quantum-chaos diagnostic that needs no unfolding. The panel
 * diagonalises H (≤ 6 qubits), histograms r, and overlays the Poisson
 * (integrable, ⟨r⟩≈0.386) and GOE Wigner–Dyson (chaotic, ⟨r⟩≈0.531) surmises.
 */
export function LevelStatisticsPanel() {
  return (
    <PanelShell id="level-statistics" title="Level statistics" defaultCollapsed>
      <Body />
    </PanelShell>
  );
}

function Body() {
  const collapsed = usePanelCollapsed();
  const [text, setText] = useState(PRESETS["Tilted Ising + gradient (chaotic, 6q)"]);

  const parsed = useMemo(() => {
    if (collapsed) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const n = pauliSumQubitCount(terms);
      if (n > MAX_QUBITS) return { error: `${n} qubits — capped at ${MAX_QUBITS}` };
      const spec = hamiltonianSpectrum(terms, n, MAX_QUBITS);
      if (!spec) return { error: "could not diagonalise" };
      const stats = levelStatistics(spec.energies);
      if (!stats) return { error: "need ≥ 3 levels" };
      return { stats, levels: spec.energies.length };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, text]) as
    | null
    | { error: string; stats?: undefined }
    | { error?: undefined; stats: LevelStatsResult; levels: number };

  return (
    <div className="lvl">
      <div className="lvl__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="lvl__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="lvl__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.stats && <Hist stats={parsed.stats} levels={parsed.levels} />}
    </div>
  );
}

const W = 300;
const H = 150;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

// Reference P(r) surmises.
const pPoisson = (r: number) => 2 / ((1 + r) * (1 + r));
const pGOE = (r: number) => (27 / 4) * ((r + r * r) / Math.pow(1 + r + r * r, 2.5));

function Hist({ stats, levels }: { stats: LevelStatsResult; levels: number }) {
  const { hist, bins, meanRatio, degenerateFraction } = stats;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const yMax = Math.max(2.2, ...hist) * 1.05;
  const xOf = (r: number) => PAD_L + r * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;

  const barW = plotW / bins;
  const samples = 80;
  const refPath = (f: (r: number) => number) =>
    Array.from({ length: samples + 1 }, (_, k) => {
      const r = k / samples;
      return `${xOf(r).toFixed(1)},${yOf(f(r)).toFixed(1)}`;
    }).join(" ");

  // Which surmise is closer, for the verdict line.
  const verdict =
    Math.abs(meanRatio - GOE_R) < Math.abs(meanRatio - POISSON_R) ? "GOE / chaotic" : "Poisson / integrable";

  return (
    <div className="lvl__out">
      <div className="lvl__stats">
        <span>{levels} levels</span>
        <span>⟨r⟩ = <b>{meanRatio.toFixed(3)}</b></span>
        <span className="lvl__verdict">{verdict}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lvl__svg plot-fill" role="img">
        {/* axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="lvl__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="lvl__axis-line" />
        {/* histogram bars */}
        {hist.map((v, k) => (
          <rect
            key={k}
            x={(xOf(k / bins) + 0.5).toFixed(1)}
            y={yOf(v).toFixed(1)}
            width={(barW - 1).toFixed(1)}
            height={(H - PAD_B - yOf(v)).toFixed(1)}
            className="lvl__bar"
          />
        ))}
        {/* reference surmises */}
        <polyline points={refPath(pPoisson)} className="lvl__poisson" />
        <polyline points={refPath(pGOE)} className="lvl__goe" />
        {/* mean markers */}
        <line x1={xOf(POISSON_R)} y1={PAD_T} x2={xOf(POISSON_R)} y2={H - PAD_B} className="lvl__poisson-mark" />
        <line x1={xOf(GOE_R)} y1={PAD_T} x2={xOf(GOE_R)} y2={H - PAD_B} className="lvl__goe-mark" />
        <line x1={xOf(meanRatio)} y1={PAD_T} x2={xOf(meanRatio)} y2={H - PAD_B} className="lvl__mean-mark" />
        {/* ticks */}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="lvl__axis">{yMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="lvl__axis">0</text>
        <text x={PAD_L} y={H - 6} textAnchor="middle" className="lvl__axis">0</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="lvl__axis">r = 1</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="lvl__axis">gap ratio r</text>
      </svg>
      <div className="lvl__legend">
        <span className="lvl__key lvl__key--poisson">Poisson {POISSON_R.toFixed(3)}</span>
        <span className="lvl__key lvl__key--goe">GOE {GOE_R.toFixed(3)}</span>
        {degenerateFraction > 0.01 && (
          <span className="lvl__key lvl__key--warn">{(degenerateFraction * 100).toFixed(0)}% degenerate — pick one symmetry sector</span>
        )}
      </div>
    </div>
  );
}
