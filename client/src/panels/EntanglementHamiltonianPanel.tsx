import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementHamiltonian, type EntHamResult } from "../sim/entanglementHamiltonian";

type Props = { state: SimState };
const MAX_SIDE = 6;
const MAX_LEVELS = 32;

/**
 * Entanglement (Li–Haldane) spectrum across a cut A | (rest): the
 * "entanglement energies" ξ_i = −ln λ_i of the reduced density matrix ρ_A,
 * drawn as a level diagram. The low-lying counting and gaps fingerprint
 * topological order (this is the entanglement Hamiltonian whose edge-like
 * structure is robust to perturbations). Statevector path, smaller side ≤ 6,
 * default-collapsed.
 */
export function EntanglementHamiltonianPanel({ state }: Props) {
  return (
    <PanelShell id="entanglement-hamiltonian" title="Entanglement spectrum (Li–Haldane)" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [inA, setInA] = useState<boolean[]>([]);

  useEffect(() => {
    setInA((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<boolean>(n).fill(false);
      for (let i = 0; i < Math.floor(n / 2); i++) next[i] = true;
      return next;
    });
  }, [n]);

  const subsetA = useMemo(() => inA.flatMap((on, i) => (on ? [i] : [])), [inA]);
  const smallSide = Math.min(subsetA.length, n - subsetA.length);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (subsetA.length === 0 || subsetA.length >= n || smallSide > MAX_SIDE) return null;
    return entanglementHamiltonian(data.state, n, subsetA, MAX_SIDE);
  }, [collapsed, data, n, subsetA, smallSide]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — no statevector for the reduced density matrix.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — the entanglement spectrum from a single trajectory isn't meaningful.</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));

  return (
    <div className="enth">
      <div className="enth__cut">
        <span className="enth__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"enth__qubit" + (inA[q] ? " enth__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />
            q{q}
          </label>
        ))}
      </div>
      {subsetA.length === 0 || subsetA.length >= n ? (
        <div className="panel__placeholder">select a proper subset (not empty, not all).</div>
      ) : smallSide > MAX_SIDE ? (
        <div className="panel__notice">smaller side has {smallSide} qubits — capped at {MAX_SIDE}.</div>
      ) : result ? (
        <Levels r={result} />
      ) : null}
    </div>
  );
}

const W = 290;
const H = 130;
const PAD = 28;

function Levels({ r }: { r: EntHamResult }) {
  const levels = r.levels.slice(0, MAX_LEVELS);
  if (levels.length === 0) return <div className="panel__placeholder">product state across the cut (no spectrum).</div>;
  const lo = levels[0];
  const hi = levels[levels.length - 1];
  const span = hi - lo || 1;
  const plotH = H - 2 * PAD;
  const yOf = (e: number) => PAD + ((e - lo) / span) * plotH; // ascending downward

  return (
    <div className="enth__out">
      <div className="enth__stats">
        <span>S = <b>{r.entropy.toFixed(3)}</b> bit</span>
        <span>rank <b>{r.rank}</b></span>
        <span>ξ ∈ [<b>{lo.toFixed(2)}</b>, <b>{hi.toFixed(2)}</b>]</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="enth__svg plot-fill" role="img">
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="enth__axis-line" />
        <text x={PAD - 4} y={yOf(lo) + 3} textAnchor="end" className="enth__axis">{lo.toFixed(1)}</text>
        <text x={PAD - 4} y={yOf(hi) + 3} textAnchor="end" className="enth__axis">{hi.toFixed(1)}</text>
        {levels.map((e, k) => (
          <line key={k} x1={PAD + 4} y1={yOf(e)} x2={W - 10} y2={yOf(e)} className={k === 0 ? "enth__level enth__level--low" : "enth__level"}>
            <title>ξ[{k}] = {e.toFixed(4)}</title>
          </line>
        ))}
      </svg>
      <div className="enth__legend">ξ<sub>i</sub> = −ln λ<sub>i</sub> · lowest level (largest Schmidt weight) highlighted</div>
    </div>
  );
}
