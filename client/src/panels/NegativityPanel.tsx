import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { negativityMatrix } from "../sim/negativity";

type Props = { state: SimState };

const MAX_QUBITS = 12;

/**
 * Pairwise entanglement-negativity map. Cell (i, j) is the logarithmic
 * negativity E_N(i,j) of the two-qubit reduced state — and because PPT is
 * exact for two qubits, E_N(i,j) > 0 **iff** that pair is genuinely
 * entangled.
 *
 * This is the quantum-only complement to the Mutual-information map: MI
 * counts classical + quantum correlation together, so it can't tell a
 * shared-randomness pair (I > 0, E_N = 0) from an entangled one. A Bell
 * pair reads 1; a GHZ state's pairs read 0 (its entanglement is global,
 * not pairwise) even though their mutual information is non-zero — the two
 * panels side by side make that distinction visible. Statevector path,
 * capped at 12 qubits, default-collapsed.
 */
export function NegativityPanel({ state }: Props) {
  return (
    <PanelShell id="negativity" title="Entanglement negativity" defaultCollapsed>
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
    if (data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_QUBITS) return null;
    return negativityMatrix(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a pair</div>;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector for the reduced density matrices.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — negativity from a single trajectory isn't meaningful.</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the negativity map is capped at {MAX_QUBITS}.</div>;
  }
  if (!result) return null;

  return <Heatmap neg={result.neg} maxNeg={result.maxNeg} n={n} />;
}

const CELL = 26;
const PAD = 22;

function Heatmap({ neg, maxNeg, n }: { neg: number[][]; maxNeg: number; n: number }) {
  const grid = n * CELL;
  const W = grid + PAD;
  const H = grid + PAD;
  const scale = Math.max(1e-9, maxNeg);

  return (
    <div className="mutinfo">
      <svg viewBox={`0 0 ${W} ${H}`} className="mutinfo__svg plot-fill" role="img">
        {Array.from({ length: n }, (_, j) => (
          <text key={`cl-${j}`} x={PAD + j * CELL + CELL / 2} y={PAD - 8} textAnchor="middle" className="mutinfo__axis">{j}</text>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <text key={`rl-${i}`} x={PAD - 8} y={PAD + i * CELL + CELL / 2 + 3} textAnchor="end" className="mutinfo__axis">{i}</text>
        ))}
        {Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => {
            const v = i === j ? 0 : neg[i][j];
            const x = PAD + j * CELL;
            const y = PAD + i * CELL;
            return (
              <g key={`c-${i}-${j}`}>
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} className="mutinfo__bg" />
                {i !== j && (
                  <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} fill="var(--accent-2)" fillOpacity={Math.min(1, v / scale)}>
                    <title>E_N({i}:{j}) = {v.toFixed(3)} ebit{v > 1e-6 ? "" : " (separable)"}</title>
                  </rect>
                )}
                {n <= 8 && i !== j && v >= 0.005 && (
                  <text x={x + CELL / 2} y={y + CELL / 2 + 3} textAnchor="middle" className="mutinfo__val">{v.toFixed(2)}</text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <div className="mutinfo__legend">
        <span><span className="mutinfo__swatch mutinfo__swatch--mi" /> E_N(i:j) log-negativity (ebits)</span>
        <span className="corr__note">&gt; 0 ⟺ pair genuinely entangled</span>
      </div>
    </div>
  );
}
