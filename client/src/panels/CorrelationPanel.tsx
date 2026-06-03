import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { zzCorrelations } from "../sim/correlations";

type Props = { state: SimState };

const MAX_QUBITS = 14;

/**
 * Two-point connected ZZ correlation map: C(i,j) = ⟨Z_iZ_j⟩ − ⟨Z_i⟩⟨Z_j⟩
 * as an n×n diverging heatmap — blue for positive (aligned), warm for
 * negative (anti-aligned), faint near 0. The diagonal is the local Z
 * variance 1 − ⟨Z_i⟩². Complements the mutual-information map: where MI
 * shows total (incl. quantum) correlation, this shows the signed,
 * basis-specific Z correlation a physicist reads for ordering and
 * correlation length.
 *
 * Cheap — a single O(2ⁿ·n²) pass over the state; statevector path only,
 * capped at 14 qubits, default-collapsed.
 */
export function CorrelationPanel({ state }: Props) {
  return (
    <PanelShell id="correlations" title="ZZ correlations" defaultCollapsed>
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
    if (n < 1 || n > MAX_QUBITS) return null;
    return zzCorrelations(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector for ⟨Z_iZ_j⟩.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — correlations from a single trajectory aren't meaningful.</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the correlation map is capped at {MAX_QUBITS}.</div>;
  }
  if (!result) return null;

  return <Heatmap conn={result.conn} n={n} />;
}

const CELL = 26;
const PAD = 22;

function Heatmap({ conn, n }: { conn: number[][]; n: number }) {
  // Scale to the largest off-diagonal magnitude (diagonal variance is
  // usually largest and would wash out the off-diagonals otherwise).
  let scale = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) scale = Math.max(scale, Math.abs(conn[i][j]));
  if (scale < 1e-9) scale = 1;

  const grid = n * CELL;
  const W = PAD + grid;
  const H = PAD + grid;

  return (
    <div className="corr">
      <svg width={W} height={H} className="corr__svg" role="img">
        {Array.from({ length: n }, (_, j) => (
          <text key={`cl-${j}`} x={PAD + j * CELL + CELL / 2} y={PAD - 8} textAnchor="middle" className="corr__axis">{j}</text>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <text key={`rl-${i}`} x={PAD - 8} y={PAD + i * CELL + CELL / 2 + 3} textAnchor="end" className="corr__axis">{i}</text>
        ))}
        {Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => {
            const v = conn[i][j];
            const diag = i === j;
            const mag = diag ? Math.min(1, Math.abs(v)) : Math.min(1, Math.abs(v) / scale);
            const fill = v >= 0 ? "var(--accent-2)" : "#ff9a5a";
            const x = PAD + j * CELL;
            const y = PAD + i * CELL;
            return (
              <g key={`c-${i}-${j}`}>
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} className="corr__bg" />
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} fill={fill} fillOpacity={mag}>
                  <title>{diag ? `Var(Z${i}) = ${v.toFixed(3)}` : `C(${i},${j}) = ${v.toFixed(3)}`}</title>
                </rect>
                {n <= 8 && Math.abs(v) >= 0.005 && (
                  <text x={x + CELL / 2} y={y + CELL / 2 + 3} textAnchor="middle" className="corr__val">{v.toFixed(2)}</text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <div className="corr__legend">
        <span><span className="corr__swatch" style={{ background: "#ff9a5a" }} /> anti-correlated</span>
        <span><span className="corr__swatch corr__swatch--zero" /> 0</span>
        <span><span className="corr__swatch" style={{ background: "var(--accent-2)" }} /> correlated</span>
        <span className="corr__note">off-diag scaled to max |C|; diagonal = Var(Z_i)</span>
      </div>
    </div>
  );
}
