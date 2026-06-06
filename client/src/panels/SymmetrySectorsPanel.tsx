import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { symmetrySectors, type SymmetrySectorsResult } from "../sim/symmetrySectors";

type Props = { state: SimState };

const MAX_QUBITS = 16;

/**
 * Symmetry-sector decomposition: how the measurement weight splits across
 * excitation-number (Hamming-weight) sectors and Z₂ parity. Tells you at a
 * glance whether a circuit conserves particle number (all weight in one
 * sector ⇒ a number-conserving ansatz) or parity. Reads the basis
 * probabilities, so it works in both pure and noise modes. n ≤ 16,
 * default-collapsed.
 */
export function SymmetrySectorsPanel({ state }: Props) {
  return (
    <PanelShell id="symmetry-sectors" title="Symmetry sectors" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    if (!data.probabilities || data.probabilities.length < (1 << n)) return null;
    return symmetrySectors(data.probabilities, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the basis probabilities.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — symmetry sectors capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <View r={result} n={n} />;
}

const W = 300;
const H = 110;
const PAD_L = 24;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 24;

function View({ r, n }: { r: SymmetrySectorsResult; n: number }) {
  const { weightSectors } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const k = weightSectors.length;
  const slot = plotW / k;
  const barW = Math.max(2, slot * 0.7);
  const yMax = Math.max(0.05, ...weightSectors);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const xOf = (i: number) => PAD_L + slot * (i + 0.5);

  return (
    <div className="sym">
      <div className="sym__badges">
        <span className={`sym__badge${r.numberConserved ? " sym__badge--on" : ""}`}>
          {r.numberConserved ? "particle number conserved" : `${r.numOccupiedSectors} N-sectors`}
        </span>
        <span className={`sym__badge${r.parityConserved ? " sym__badge--on" : ""}`}>
          {r.parityConserved ? "parity conserved" : "parity mixed"}
        </span>
        <span className="sym__pz">⟨ΠZ⟩ = <b>{r.parityExpectation.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sym__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="sym__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="sym__axis-line" />
        {weightSectors.map((w, i) => (
          <g key={i}>
            <rect
              x={(xOf(i) - barW / 2).toFixed(1)}
              y={yOf(w).toFixed(1)}
              width={barW.toFixed(1)}
              height={(H - PAD_B - yOf(w)).toFixed(1)}
              className={`sym__bar${i & 1 ? " sym__bar--odd" : ""}`}
            />
            <text x={xOf(i).toFixed(1)} y={H - PAD_B + 11} textAnchor="middle" className="sym__axis">{i}</text>
            {w > 0.005 && (
              <text x={xOf(i).toFixed(1)} y={(yOf(w) - 2).toFixed(1)} textAnchor="middle" className="sym__val">
                {w >= 0.995 ? "1" : w.toFixed(2).slice(1)}
              </text>
            )}
          </g>
        ))}
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} textAnchor="middle" className="sym__axis">excitation number k (0…{n})</text>
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="sym__axis">{yMax >= 0.995 ? "1" : yMax.toFixed(2)}</text>
      </svg>
      <div className="sym__legend">
        <span className="sym__key sym__key--even">even ΣP = {r.parityEven.toFixed(3)}</span>
        <span className="sym__key sym__key--odd">odd ΣP = {r.parityOdd.toFixed(3)}</span>
      </div>
    </div>
  );
}
