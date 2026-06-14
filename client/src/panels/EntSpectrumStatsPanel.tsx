import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementSpectrumStats, type EntSpectrumStatsResult } from "../sim/entanglementSpectrumStats";

type Props = { state: SimState };
const MAX_SIDE = 8;

/**
 * Entanglement-spectrum level statistics — the consecutive-gap-ratio
 * distribution of the entanglement energies ξ_i = −ln λ_i across a cut.
 * ⟨r⟩ ≈ 0.386 (Poisson) signals a localized / MBL phase; ⟨r⟩ ≈ 0.536 (GOE)
 * signals an ergodic / thermal phase — the MBL diagnostic applied to the
 * *entanglement* Hamiltonian rather than the energy spectrum. Statevector
 * path, smaller cut side ≤ 8, default-collapsed.
 */
export function EntSpectrumStatsPanel({ state }: Props) {
  return (
    <PanelShell id="ent-spectrum-stats" title="Entanglement-spectrum statistics" defaultCollapsed>
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
    return entanglementSpectrumStats(data.state, n, subsetA, MAX_SIDE);
  }, [collapsed, data, n, subsetA, smallSide]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 3) return <div className="panel__placeholder">needs ≥ 3 qubits (and ≥ 3 entanglement levels)</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrix.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — single-trajectory spectrum isn't meaningful.</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="entstat">
      <div className="entstat__cut">
        <span className="entstat__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"entstat__qubit" + (inA[q] ? " entstat__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {smallSide > MAX_SIDE ? (
        <div className="panel__notice">smaller side {smallSide} qubits — capped at {MAX_SIDE}.</div>
      ) : result ? (
        <View r={result} />
      ) : (
        <div className="panel__placeholder">need at least 3 entanglement levels (try a more entangled cut).</div>
      )}
    </div>
  );
}

const W = 300;
const H = 110;
const PAD_B = 18;

function View({ r }: { r: EntSpectrumStatsResult }) {
  const bins = 10;
  const hist = new Array<number>(bins).fill(0);
  for (const rr of r.ratios) { let b = Math.floor(rr * bins); if (b >= bins) b = bins - 1; hist[b]++; }
  const max = Math.max(1, ...hist);
  const bw = (W - 4) / bins;
  const xOf = (v: number) => 2 + v * (W - 4);
  return (
    <div className="entstat__out">
      <div className="entstat__stats">
        <span>⟨r⟩ = <b>{r.meanR.toFixed(3)}</b></span>
        <span className="entstat__tag">{r.meanR < 0.46 ? "Poisson-like (localized)" : "GOE-like (ergodic)"}</span>
        <span>{r.levels} levels</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="entstat__svg plot-fill" role="img">
        <line x1={0} y1={H - PAD_B} x2={W} y2={H - PAD_B} className="entstat__axis-line" />
        {hist.map((c, i) => {
          const h = (c / max) * (H - PAD_B - 4);
          return <rect key={i} x={2 + i * bw} y={H - PAD_B - h} width={bw - 1} height={h} className="entstat__bar" />;
        })}
        <line x1={xOf(0.386)} y1={4} x2={xOf(0.386)} y2={H - PAD_B} className="entstat__poisson" />
        <line x1={xOf(0.536)} y1={4} x2={xOf(0.536)} y2={H - PAD_B} className="entstat__goe" />
        <text x={xOf(0.386)} y={H - 4} textAnchor="middle" className="entstat__axis">P</text>
        <text x={xOf(0.536)} y={H - 4} textAnchor="middle" className="entstat__axis">GOE</text>
      </svg>
      <div className="entstat__legend">gap-ratio histogram of ξ_i = −ln λ_i · ⟨r⟩ → 0.386 Poisson / 0.536 GOE</div>
    </div>
  );
}
