import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { concurrenceMatrix, MAX_CONCURRENCE_QUBITS } from "../sim/concurrence";

type Props = { state: SimState };

/**
 * Pairwise Wootters concurrence map. Cell (i, j) is the concurrence of the
 * two-qubit reduced state C(ρ_ij) ∈ [0, 1] — a faithful entanglement-of-
 * formation monotone (0 = separable, 1 = Bell pair). Complement to the
 * negativity map: concurrence is monogamy-aware (Σ_j C² ≤ 1 per qubit), so a
 * W state reads 2/3 on every pair while GHZ reads 0 (its entanglement is
 * global, not pairwise). Statevector path, n ≤ 10, default-collapsed.
 */
export function ConcurrencePanel({ state }: Props) {
  return (
    <PanelShell id="concurrence" title="Concurrence" defaultCollapsed>
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
    if (n < 2 || n > MAX_CONCURRENCE_QUBITS) return null;
    return concurrenceMatrix(data.state, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a pair</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — no statevector for the reduced density matrices.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — concurrence from a single trajectory isn't meaningful.</div>;
  if (n > MAX_CONCURRENCE_QUBITS)
    return <div className="panel__notice">{n} qubits — the concurrence map is capped at {MAX_CONCURRENCE_QUBITS}.</div>;
  if (!result) return null;

  return <Heatmap c={result.c} max={result.max} n={n} />;
}

const PAD = 22;
const TARGET_W = 300;

function Heatmap({ c, max, n }: { c: number[][]; max: number; n: number }) {
  const CELL = Math.max(16, Math.floor((TARGET_W - PAD) / n));
  const grid = n * CELL;
  const W = grid + PAD;
  const H = grid + PAD;

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
            const v = i === j ? 0 : c[i][j];
            const x = PAD + j * CELL;
            const y = PAD + i * CELL;
            return (
              <g key={`c-${i}-${j}`}>
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} className="mutinfo__bg" />
                {i !== j && (
                  <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} fill="var(--accent-2)" fillOpacity={Math.min(1, v)}>
                    <title>C({i}:{j}) = {v.toFixed(3)}{v > 1e-6 ? "" : " (separable)"}</title>
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
        <span><span className="mutinfo__swatch mutinfo__swatch--mi" /> C(i:j) concurrence (max {max.toFixed(2)})</span>
        <span className="corr__note">entanglement of formation · monogamy: Σ_j C² ≤ 1</span>
      </div>
    </div>
  );
}
