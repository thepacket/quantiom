import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { mutualInformationMatrix } from "../sim/entanglement";

type Props = { state: SimState };

const MAX_QUBITS = 12;

/**
 * Mutual-information map — the entanglement topology of the current state.
 *
 * Off-diagonal cell (i, j) is the pairwise quantum mutual information
 * I(i:j) = S(ρ_i) + S(ρ_j) − S(ρ_ij) in bits (0 … 2). The diagonal shows
 * each qubit's own von Neumann entropy S(ρ_i) (0 … 1 bit) — how entangled
 * that qubit is with the rest of the register. A GHZ state lights up
 * all-to-all; a cluster state shows a nearest-neighbour band; a product
 * state is blank.
 *
 * Cost is C(n,2) two-qubit partial traces, each O(2ⁿ); capped at 12
 * qubits and computed only while the panel is open (default-collapsed),
 * so it's free until you ask for it.
 */
export function MutualInfoPanel({ state }: Props) {
  return (
    <PanelShell id="mutual-info" title="Mutual information" defaultCollapsed>
      <MutualInfoBody state={state} />
    </PanelShell>
  );
}

function MutualInfoBody({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return mutualInformationMatrix(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) {
    return (
      <div className="panel__notice">
        Clifford fast path — no statevector is materialised, so the
        reduced density matrices needed for mutual information aren't
        available. Use a non-Clifford gate or fewer qubits to drop back to
        the statevector simulator.
      </div>
    );
  }
  if (data.isNoisy) {
    return (
      <div className="panel__notice">
        Noise mode on — mutual information from a single trajectory isn't
        meaningful. Disable noise to inspect the pure-state entanglement
        structure.
      </div>
    );
  }
  if (n > MAX_QUBITS) {
    return (
      <div className="panel__notice">
        {n} qubits — the mutual-information map is capped at {MAX_QUBITS}
        {" "}(it builds every pairwise reduced density matrix).
      </div>
    );
  }
  if (!result) return null;

  return <MutualInfoHeatmap mi={result.mi} single={result.single} n={n} />;
}

const CELL = 26;
const PAD = 22; // room for axis labels

function MutualInfoHeatmap({ mi, single, n }: { mi: number[][]; single: number[]; n: number }) {
  const grid = n * CELL;
  const W = grid + PAD;
  const H = grid + PAD;

  // Off-diagonal MI ranges 0..2 bits; diagonal single-qubit entropy 0..1.
  const cell = (i: number, j: number) => {
    if (i === j) {
      const s = single[i];
      // Diagonal: single-qubit entropy, amber hue to distinguish from MI.
      return { fill: "var(--accent)", opacity: clamp(s / 1), value: s, kind: "S" as const };
    }
    const v = mi[i][j];
    return { fill: "var(--accent-2)", opacity: clamp(v / 2), value: v, kind: "I" as const };
  };

  return (
    <div className="mutinfo">
      <svg viewBox={`0 0 ${W} ${H}`} className="mutinfo__svg plot-fill" role="img">
        {/* column labels */}
        {Array.from({ length: n }, (_, j) => (
          <text
            key={`cl-${j}`}
            x={PAD + j * CELL + CELL / 2}
            y={PAD - 8}
            textAnchor="middle"
            className="mutinfo__axis"
          >
            {j}
          </text>
        ))}
        {/* row labels */}
        {Array.from({ length: n }, (_, i) => (
          <text
            key={`rl-${i}`}
            x={PAD - 8}
            y={PAD + i * CELL + CELL / 2 + 3}
            textAnchor="end"
            className="mutinfo__axis"
          >
            {i}
          </text>
        ))}
        {/* cells */}
        {Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => {
            const c = cell(i, j);
            const x = PAD + j * CELL;
            const y = PAD + i * CELL;
            return (
              <g key={`c-${i}-${j}`}>
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} rx={2} className="mutinfo__bg" />
                <rect
                  x={x + 1}
                  y={y + 1}
                  width={CELL - 2}
                  height={CELL - 2}
                  rx={2}
                  fill={c.fill}
                  fillOpacity={c.opacity}
                >
                  <title>
                    {c.kind === "S"
                      ? `qubit ${i}: S(ρ) = ${c.value.toFixed(3)} bit`
                      : `I(${i}:${j}) = ${c.value.toFixed(3)} bit`}
                  </title>
                </rect>
                {n <= 8 && c.value >= 0.005 && (
                  <text x={x + CELL / 2} y={y + CELL / 2 + 3} textAnchor="middle" className="mutinfo__val">
                    {c.value.toFixed(2)}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
      <div className="mutinfo__legend">
        <span><span className="mutinfo__swatch mutinfo__swatch--mi" /> I(i:j) mutual info (0–2 bit)</span>
        <span><span className="mutinfo__swatch mutinfo__swatch--s" /> diagonal: S(ρ_i) (0–1 bit)</span>
      </div>
    </div>
  );
}

function clamp(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
