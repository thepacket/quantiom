import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { hamiltonianSpectrum } from "../sim/hamSpectrum";
import { pauliSumExpectation } from "../sim/expectation";

type Props = { state: SimState };

const MAX_QUBITS = 6;

const PRESETS: Record<string, string> = {
  "TFIM (3 spins)": "-1*ZZI - 1*IZZ - 0.5*XII - 0.5*IXI - 0.5*IIX",
  "Heisenberg (2 spins)": "1*XX + 1*YY + 1*ZZ",
  "H₂ (minimal, 2q)": "-1.0523*II + 0.3979*IZ - 0.3979*ZI - 0.0113*ZZ + 0.1809*XX",
  "Single spin in field": "1*Z + 0.5*X",
};

/**
 * Exact eigenvalue spectrum of a Pauli-sum Hamiltonian H = Σ h_k P_k —
 * the reference a VQE run is trying to reach. Enter H as a Pauli sum (same
 * grammar as the Hamiltonian → Trotter panel); the panel diagonalises the
 * dense 2ⁿ×2ⁿ matrix and draws every energy level, the ground energy, and
 * the spectral gap (which sets how hard the optimisation is). If the
 * current circuit has the same qubit count, its ⟨H⟩ is overlaid so you can
 * see where the prepared state sits in the spectrum.
 *
 * Diagonalisation is on demand, capped at 6 qubits. Default-collapsed.
 */
export function HamSpectrumPanel({ state }: Props) {
  return (
    <PanelShell id="ham-spectrum" title="Hamiltonian spectrum" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const [text, setText] = useState(PRESETS["TFIM (3 spins)"]);

  const parsed = useMemo(() => {
    if (collapsed) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const n = pauliSumQubitCount(terms);
      if (n > MAX_QUBITS) return { error: `${n} qubits — capped at ${MAX_QUBITS}` };
      const spec = hamiltonianSpectrum(terms, n, MAX_QUBITS);
      if (!spec) return { error: "could not diagonalise" };
      // Overlay ⟨H⟩ if the live state matches the Hamiltonian's width.
      let expectation: number | null = null;
      if (data && !data.isStabilizer && !data.isNoisy && data.numQubits === n) {
        expectation = pauliSumExpectation(data.state, n, terms);
      }
      return { spec, expectation };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, text, data]) as
    | null
    | { error: string; spec?: undefined }
    | { error?: undefined; spec: { energies: number[]; ground: number; gap: number }; expectation: number | null };

  return (
    <div className="hamspec">
      <div className="hamspec__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="hamspec__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea
        className="hamspec__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="e.g. -1*ZZ - 0.5*XI - 0.5*IX"
      />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.spec && <Levels spec={parsed.spec} expectation={parsed.expectation} />}
    </div>
  );
}

const W = 280;
const H = 130;
const PAD = 30;

function Levels({
  spec,
  expectation,
}: {
  spec: { energies: number[]; ground: number; gap: number };
  expectation: number | null;
}) {
  const { energies, ground, gap } = spec;
  const emin = energies[0];
  const emax = energies[energies.length - 1];
  const span = emax - emin || 1;
  const plotH = H - 2 * PAD;
  const yOf = (e: number) => PAD + (1 - (e - emin) / span) * plotH;

  return (
    <div className="hamspec__out">
      <div className="hamspec__stats">
        <span>E₀ = <b>{ground.toFixed(4)}</b></span>
        <span>gap = <b>{gap.toFixed(4)}</b></span>
        <span>{energies.length} levels</span>
      </div>
      <svg width={W} height={H} className="hamspec__svg" role="img">
        {/* energy axis */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="hamspec__axis-line" />
        <text x={PAD - 4} y={yOf(emax) + 3} textAnchor="end" className="hamspec__axis">{emax.toFixed(2)}</text>
        <text x={PAD - 4} y={yOf(emin) + 3} textAnchor="end" className="hamspec__axis">{emin.toFixed(2)}</text>
        {/* levels as horizontal ticks */}
        {energies.map((e, k) => (
          <line key={k} x1={PAD + 4} y1={yOf(e)} x2={W - 10} y2={yOf(e)} className={k === 0 ? "hamspec__level hamspec__level--ground" : "hamspec__level"}>
            <title>E[{k}] = {e.toFixed(5)}</title>
          </line>
        ))}
        {/* ⟨H⟩ overlay */}
        {expectation !== null && Number.isFinite(expectation) && (
          <g>
            <line x1={PAD} y1={yOf(expectation)} x2={W - 4} y2={yOf(expectation)} className="hamspec__exp" />
            <text x={W - 4} y={yOf(expectation) - 3} textAnchor="end" className="hamspec__exp-label">⟨H⟩={expectation.toFixed(3)}</text>
          </g>
        )}
      </svg>
      <div className="hamspec__legend">
        <span><span className="hamspec__swatch hamspec__swatch--ground" /> ground</span>
        {expectation !== null && <span><span className="hamspec__swatch hamspec__swatch--exp" /> current ⟨H⟩</span>}
      </div>
    </div>
  );
}
