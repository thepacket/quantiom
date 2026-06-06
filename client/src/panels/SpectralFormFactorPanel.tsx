import { useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { hamiltonianSpectrum } from "../sim/hamSpectrum";
import { spectralFormFactor, type SffResult } from "../sim/spectralFormFactor";

const MAX_QUBITS = 6;

const PRESETS: Record<string, string> = {
  "Tilted Ising (chaotic, 4q)":
    "-1*ZZII - 1*IZZI - 1*IIZZ + 0.9045*XIII + 0.9045*IXII + 0.9045*IIXI + 0.9045*IIIX + 0.809*ZIII + 0.809*IZII + 0.809*IIZI + 0.809*IIIZ",
  "Transverse Ising (integrable, 4q)":
    "-1*ZZII - 1*IZZI - 1*IIZZ - 1*XIII - 1*IXII - 1*IIXI - 1*IIIX",
  "Heisenberg (3q)": "1*XXI + 1*IXX + 1*YYI + 1*IYY + 1*ZZI + 1*IZZ",
};

/**
 * Spectral form factor SFF(t) = |Σ e^{-iEₖt}|²/D² of a Pauli-sum
 * Hamiltonian's spectrum — the dip–ramp–plateau quantum-chaos diagnostic.
 * Enter H (same grammar as the Hamiltonian → Trotter panel); the panel
 * diagonalises it (≤ 6 qubits), then plots the SFF on log-log axes with the
 * late-time plateau and Heisenberg time marked. A chaotic (RMT) spectrum
 * shows a clean linear ramp; an integrable one is bumpy and ramp-less.
 */
export function SpectralFormFactorPanel() {
  return (
    <PanelShell id="spectral-form-factor" title="Spectral form factor" defaultCollapsed>
      <Body />
    </PanelShell>
  );
}

function Body() {
  const collapsed = usePanelCollapsed();
  const [text, setText] = useState(PRESETS["Tilted Ising (chaotic, 4q)"]);

  const parsed = useMemo(() => {
    if (collapsed) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const n = pauliSumQubitCount(terms);
      if (n > MAX_QUBITS) return { error: `${n} qubits — capped at ${MAX_QUBITS}` };
      const spec = hamiltonianSpectrum(terms, n, MAX_QUBITS);
      if (!spec) return { error: "could not diagonalise" };
      const sff = spectralFormFactor(spec.energies);
      if (!sff) return { error: "need ≥ 2 levels" };
      return { sff, levels: spec.energies.length };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, text]) as
    | null
    | { error: string; sff?: undefined }
    | { error?: undefined; sff: SffResult; levels: number };

  return (
    <div className="sff">
      <div className="sff__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="sff__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="sff__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.sff && <Curve sff={parsed.sff} levels={parsed.levels} />}
    </div>
  );
}

const W = 300;
const H = 140;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 18;

function Curve({ sff, levels }: { sff: SffResult; levels: number }) {
  const { t, sff: y, plateau, heisenbergTime } = sff;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const logT = t.map((v) => Math.log10(v));
  const tLo = logT[0];
  const tHi = logT[logT.length - 1];
  const xOf = (lt: number) => PAD_L + ((lt - tLo) / (tHi - tLo)) * plotW;

  // Log-y, clamped to a floor so the dip doesn't blow up to −∞.
  const floor = Math.min(plateau / 100, 1e-4);
  const yLo = Math.log10(floor);
  const yHi = 0; // SFF(0) = 1 → log10 = 0
  const yOf = (val: number) => PAD_T + (1 - (Math.log10(Math.max(val, floor)) - yLo) / (yHi - yLo)) * plotH;

  const path = y.map((v, k) => `${xOf(logT[k]).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const yPlateau = yOf(plateau);
  const xHeis = xOf(Math.log10(heisenbergTime));

  return (
    <div className="sff__out">
      <div className="sff__stats">
        <span>{levels} levels</span>
        <span>plateau = <b>{plateau.toExponential(2)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sff__svg plot-fill" role="img">
        {/* axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="sff__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="sff__axis-line" />
        {/* plateau reference */}
        <line x1={PAD_L} y1={yPlateau} x2={W - PAD_R} y2={yPlateau} className="sff__plateau" />
        <text x={W - PAD_R} y={yPlateau - 3} textAnchor="end" className="sff__axis">plateau</text>
        {/* Heisenberg time marker */}
        {xHeis > PAD_L && xHeis < W - PAD_R && (
          <>
            <line x1={xHeis} y1={PAD_T} x2={xHeis} y2={H - PAD_B} className="sff__heis" />
            <text x={xHeis} y={H - 6} textAnchor="middle" className="sff__axis">t_H</text>
          </>
        )}
        {/* SFF curve */}
        <polyline points={path} className="sff__curve" />
        {/* y ticks */}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="sff__axis">1</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="sff__axis">{floor.toExponential(0)}</text>
        <text x={PAD_L + 2} y={H - 6} textAnchor="start" className="sff__axis">log t →</text>
      </svg>
      <div className="sff__legend">dip → ramp → plateau · a clean linear ramp ⇒ chaotic (RMT) spectrum</div>
    </div>
  );
}
