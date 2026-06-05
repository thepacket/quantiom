import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { spaceTimeEntropy } from "../sim/spacetime";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 12;
const MAX_COLS = 80;

/**
 * Space–time entanglement map. Rows are qubits (q0 on top), columns are
 * circuit time steps; cell intensity is the single-qubit entanglement
 * entropy S(ρ_q) after that column — dark for a pure (disentangled) qubit,
 * bright for a maximally-mixed one (maximally entangled with the rest).
 *
 * Companion to the Space–time ⟨Z⟩ map: this shows where and when
 * entanglement grows. A Bell pair lights up two cells at once; a
 * Trotterised chain shows an entanglement front spreading along a light
 * cone; a disentangling (uncomputation) tail fades back to dark.
 *
 * Cost: one simulation per column + one 2×2 reduced DM per (qubit,
 * column). Capped at 12 qubits × 80 columns, computed only while open.
 */
export function SpaceTimeEntropyPanel(props: Props) {
  return (
    <PanelShell id="space-time-entropy" title="Space–time entropy" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;
  const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
  const numCols = maxCol + 1;

  const result = useMemo(() => {
    if (collapsed) return null;
    return spaceTimeEntropy(circuit, paramValues, customGates, { maxQubits: MAX_QUBITS, maxCols: MAX_COLS });
  }, [collapsed, circuit, paramValues, customGates]);

  if (n === 0 || numCols < 1) {
    return <div className="panel__placeholder">place some gates to see entanglement growth</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the entropy map is capped at {MAX_QUBITS}.</div>;
  }
  if (numCols > MAX_COLS) {
    return <div className="panel__notice">{numCols} columns — the entropy map is capped at {MAX_COLS}.</div>;
  }
  if (!result) return null;

  return <EntropyGrid s={result.s} numCols={result.numCols} n={result.numQubits} />;
}

const ROW_H = 16;
const LABEL_W = 22;
const MAX_GRID_W = 320;

function EntropyGrid({ s, numCols, n }: { s: number[][]; numCols: number; n: number }) {
  // Fill the panel width: cells grow when there are few columns (so the
  // viewBox ≈ the rendered size and the px fonts aren't magnified), and shrink
  // toward a readable minimum when there are many.
  const colW = Math.max(6, Math.floor((MAX_GRID_W - LABEL_W) / numCols));
  const grid = numCols * colW;
  const W = LABEL_W + grid;
  const H = n * ROW_H + 16;
  const tickEvery = Math.max(1, Math.ceil(numCols / 8));

  return (
    <div className="spacetime">
      <svg viewBox={`0 0 ${W} ${H}`} className="spacetime__svg plot-fill" role="img">
        {Array.from({ length: n }, (_, q) => (
          <text key={`r-${q}`} x={LABEL_W - 4} y={q * ROW_H + ROW_H / 2 + 3} textAnchor="end" className="spacetime__axis">
            {q}
          </text>
        ))}
        {Array.from({ length: n }, (_, q) =>
          Array.from({ length: numCols }, (_, c) => {
            const v = s[q][c]; // 0..1 bit
            const x = LABEL_W + c * colW;
            const y = q * ROW_H;
            return (
              <rect
                key={`c-${q}-${c}`}
                x={x}
                y={y + 1}
                width={colW}
                height={ROW_H - 2}
                fill="var(--accent)"
                fillOpacity={Math.min(1, Math.max(0, v))}
                className="spacetime__cell"
              >
                <title>q{q}, step {c}: S(ρ) = {v.toFixed(3)} bit</title>
              </rect>
            );
          }),
        )}
        {Array.from({ length: numCols }, (_, c) =>
          c % tickEvery === 0 ? (
            <text key={`t-${c}`} x={LABEL_W + c * colW + colW / 2} y={H - 3} textAnchor="middle" className="spacetime__axis">
              {c}
            </text>
          ) : null,
        )}
      </svg>
      <div className="spacetime__legend">
        <span><span className="spacetime__swatch spacetime__swatch--zero" /> S = 0 (pure)</span>
        <span><span className="spacetime__swatch" style={{ background: "var(--accent)" }} /> S = 1 (max entangled)</span>
      </div>
    </div>
  );
}
