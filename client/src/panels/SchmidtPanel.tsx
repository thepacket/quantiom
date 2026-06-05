import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entanglementSpectrum } from "../sim/entanglement";

type Props = { state: SimState };

const MAX_SIDE = 6;
const MAX_BARS = 32;

/**
 * Entanglement spectrum across a bipartition A | (rest). For a pure state
 * the squared Schmidt coefficients are the eigenvalues of ρ_A; their
 * spread is the entanglement across the cut. Shows the spectrum as a bar
 * chart plus the von Neumann entropy S(ρ_A) and the Schmidt rank.
 *
 * A product state across the cut has a single bar at 1 (rank 1, S = 0); a
 * maximally entangled cut has a flat spectrum (S = |A| bits). Researchers
 * read the decay of the spectrum as the bond dimension an MPS would need.
 *
 * Diagonalises the smaller side, so cost is set by min(|A|, n−|A|);
 * capped at 6 qubits there, statevector path only, default-collapsed.
 */
export function SchmidtPanel({ state }: Props) {
  return (
    <PanelShell id="schmidt" title="Entanglement spectrum" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [inA, setInA] = useState<boolean[]>([]);

  // Default cut: the first half of the register.
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
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    if (subsetA.length === 0 || subsetA.length >= n || smallSide > MAX_SIDE) return null;
    return entanglementSpectrum(data.state, n, subsetA, MAX_SIDE);
  }, [collapsed, data, n, subsetA, smallSide]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector for the reduced density matrix.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — entanglement spectrum from a single trajectory isn't meaningful.</div>;
  }

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));

  return (
    <div className="schmidt">
      <div className="schmidt__cut">
        <span className="schmidt__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"schmidt__qubit" + (inA[q] ? " schmidt__qubit--on" : "")}>
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
        <Spectrum result={result} subsetSize={subsetA.length} otherSize={n - subsetA.length} />
      ) : null}
    </div>
  );
}

function Spectrum({
  result,
  subsetSize,
  otherSize,
}: {
  result: { spectrum: number[]; entropy: number; rank: number };
  subsetSize: number;
  otherSize: number;
}) {
  const { spectrum, entropy, rank } = result;
  const maxEntropy = Math.min(subsetSize, otherSize); // bits
  const bars = spectrum.slice(0, MAX_BARS);
  const max = bars[0] || 1;
  const W = 300;
  const H = 90;
  const bw = Math.max(2, Math.floor((W - 2) / bars.length) - 1);

  return (
    <div className="schmidt__out">
      <div className="schmidt__stats">
        <span>S = <b>{entropy.toFixed(3)}</b> / {maxEntropy} bit</span>
        <span>Schmidt rank <b>{rank}</b></span>
        <span>λ²<sub>max</sub> = {max.toFixed(3)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="schmidt__svg plot-fill" role="img">
        <line x1={0} y1={H - 12} x2={W} y2={H - 12} className="schmidt__axis-line" />
        {bars.map((p, k) => {
          const h = (p / max) * (H - 16);
          const x = 1 + k * (bw + 1);
          return (
            <rect key={k} x={x} y={H - 12 - h} width={bw} height={h} className="schmidt__bar">
              <title>λ²[{k}] = {p.toFixed(4)}</title>
            </rect>
          );
        })}
      </svg>
      {spectrum.length > MAX_BARS && (
        <div className="schmidt__more">showing top {MAX_BARS} of {spectrum.length} coefficients</div>
      )}
    </div>
  );
}
