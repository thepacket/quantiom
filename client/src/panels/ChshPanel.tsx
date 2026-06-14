import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { chshMap, type ChshResult } from "../sim/chsh";

type Props = { state: SimState };
const MAX_QUBITS = 12;

/**
 * CHSH / Bell-nonlocality map — the maximal CHSH value per qubit pair via the
 * Horodecki criterion S_max = 2√(t₁²+t₂²) (t₁,t₂ = two largest singular values
 * of the correlation matrix T_ij = ⟨σ_iσ_j⟩). **S_max > 2** (highlighted) is a
 * device-independent certificate of nonlocality; the Tsirelson bound is
 * 2√2 ≈ 2.83. Statevector path, n ≤ 12, default-collapsed.
 */
export function ChshPanel({ state }: Props) {
  return (
    <PanelShell id="chsh" title="CHSH / Bell nonlocality" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_QUBITS) return null;
    return chshMap(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs statevector Pauli correlators.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — single-trajectory correlators aren't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Heat r={result} />;
}

const SIZE = 220;

function Heat({ r }: { r: ChshResult }) {
  const { s, numQubits: n, max } = r;
  const cell = SIZE / n;
  return (
    <div className="chsh__out">
      <div className="chsh__stats">
        <span>max S = <b>{max.toFixed(3)}</b></span>
        <span className="chsh__tag">{max > 2.0001 ? "Bell-violating pair present" : "all local (S ≤ 2)"}</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chsh__svg plot-fill" role="img">
        {s.map((row, a) =>
          row.map((v, b) => {
            if (a === b) return <rect key={`${a}-${b}`} x={b * cell} y={a * cell} width={cell + 0.5} height={cell + 0.5} className="chsh__diag" />;
            const violate = v > 2.0001;
            // 0..2 grey ramp; >2 switches to a warm violation ramp toward 2√2.
            const bg = violate
              ? `rgba(255, 142, 111, ${(0.25 + 0.7 * Math.min(1, (v - 2) / (2 * Math.SQRT2 - 2))).toFixed(3)})`
              : `rgba(110, 177, 255, ${(0.06 + 0.5 * (v / 2)).toFixed(3)})`;
            return (
              <rect key={`${a}-${b}`} x={b * cell} y={a * cell} width={cell + 0.5} height={cell + 0.5} fill={bg}>
                <title>pair (q{a}, q{b}): S = {v.toFixed(4)}{violate ? " — nonlocal" : ""}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="chsh__legend">S_max per pair · orange = S &gt; 2 (Bell-violating) · Tsirelson 2√2 ≈ 2.83</div>
    </div>
  );
}
