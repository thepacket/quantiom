import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { spaceTimeZ } from "../sim/spacetime";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 14;
const MAX_COLS = 80;

/**
 * Space–time magnetisation map. Rows are qubits (q0 on top), columns are
 * circuit time steps; cell colour is ⟨Z_q⟩ after that column — blue for
 * +1 (spin up / |0⟩), warm for −1 (spin down / |1⟩), faint near 0.
 *
 * This is the many-body "space–time diagram": a transverse-field kick
 * flips the whole row each Floquet period (period-doubling stripes), a
 * Trotterised chain shows excitations spreading along a light cone, and a
 * static product circuit shows flat rows. Pairs with the kicked-Ising /
 * Trotter examples.
 *
 * Cost: one simulation per column. Capped at 14 qubits × 80 columns and
 * computed only while open (default-collapsed).
 */
export function SpaceTimePanel(props: Props) {
  return (
    <PanelShell id="space-time" title="Space–time ⟨Z⟩" defaultCollapsed>
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
    return spaceTimeZ(circuit, paramValues, customGates, { maxQubits: MAX_QUBITS, maxCols: MAX_COLS });
  }, [collapsed, circuit, paramValues, customGates]);

  if (n === 0 || numCols < 1) {
    return <div className="panel__placeholder">place some gates to see the dynamics</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the space–time map is capped at {MAX_QUBITS}.</div>;
  }
  if (numCols > MAX_COLS) {
    return <div className="panel__notice">{numCols} columns — the space–time map is capped at {MAX_COLS}.</div>;
  }
  if (!result) return null;

  return <SpaceTimeGrid z={result.z} numCols={result.numCols} n={result.numQubits} />;
}

const ROW_H = 16;
const LABEL_W = 22;
const MAX_GRID_W = 320;

function SpaceTimeGrid({ z, numCols, n }: { z: number[][]; numCols: number; n: number }) {
  const colW = Math.max(3, Math.min(16, Math.floor((MAX_GRID_W - LABEL_W) / numCols)));
  const grid = numCols * colW;
  const W = LABEL_W + grid;
  const H = n * ROW_H + 16;

  // Diverging fill: +1 → blue (accent-2), −1 → warm. Opacity = |⟨Z⟩|.
  const fillFor = (v: number) => (v >= 0 ? "var(--accent-2)" : "#ff9a5a");

  // Sparse column ticks so the axis stays readable.
  const tickEvery = Math.max(1, Math.ceil(numCols / 8));

  return (
    <div className="spacetime">
      <svg viewBox={`0 0 ${W} ${H}`} className="spacetime__svg plot-fill" role="img">
        {/* row (qubit) labels */}
        {Array.from({ length: n }, (_, q) => (
          <text key={`r-${q}`} x={LABEL_W - 4} y={q * ROW_H + ROW_H / 2 + 3} textAnchor="end" className="spacetime__axis">
            {q}
          </text>
        ))}
        {/* cells */}
        {Array.from({ length: n }, (_, q) =>
          Array.from({ length: numCols }, (_, c) => {
            const v = z[q][c];
            const x = LABEL_W + c * colW;
            const y = q * ROW_H;
            return (
              <rect
                key={`c-${q}-${c}`}
                x={x}
                y={y + 1}
                width={colW}
                height={ROW_H - 2}
                fill={fillFor(v)}
                fillOpacity={Math.min(1, Math.abs(v))}
              >
                <title>q{q}, step {c}: ⟨Z⟩ = {v.toFixed(3)}</title>
              </rect>
            );
          }),
        )}
        {/* column ticks */}
        {Array.from({ length: numCols }, (_, c) =>
          c % tickEvery === 0 ? (
            <text key={`t-${c}`} x={LABEL_W + c * colW + colW / 2} y={H - 3} textAnchor="middle" className="spacetime__axis">
              {c}
            </text>
          ) : null,
        )}
      </svg>
      <div className="spacetime__legend">
        <span><span className="spacetime__swatch" style={{ background: "#ff9a5a" }} /> ⟨Z⟩ = −1 (|1⟩)</span>
        <span><span className="spacetime__swatch spacetime__swatch--zero" /> 0</span>
        <span><span className="spacetime__swatch" style={{ background: "var(--accent-2)" }} /> ⟨Z⟩ = +1 (|0⟩)</span>
      </div>
    </div>
  );
}
