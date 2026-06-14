import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { characteristicFunction, type CharFuncResult } from "../sim/charFunction";

type Props = { state: SimState };
const MAX_QUBITS = 4;

/**
 * Discrete characteristic function |χ(u,v)| = |⟨D(u,v)⟩| on the
 * Heisenberg–Weyl lattice — the Fourier dual of the discrete Wigner function.
 * Rows index the X-support u, columns the Z-support v; χ(0,0) = 1 always. A
 * stabilizer state shows a flat ±1 comb, generic states spread mass over the
 * lattice. Statevector path, n ≤ 4, default-collapsed.
 */
export function CharacteristicFunctionPanel({ state }: Props) {
  return (
    <PanelShell id="characteristic-function" title="Characteristic function" defaultCollapsed>
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
    if (n < 1 || n > MAX_QUBITS) return null;
    return characteristicFunction(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode for the Pauli spectrum.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — χ from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — χ is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Grid r={result} />;
}

const SIZE = 220;

function Grid({ r }: { r: CharFuncResult }) {
  const { mag, dim, total } = r;
  const cell = SIZE / dim;
  return (
    <div className="charf__out">
      <div className="charf__stats">
        <span>Σ|χ| = <b>{total.toFixed(3)}</b></span>
        <span>{dim}×{dim} lattice</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="charf__svg plot-fill" role="img">
        {mag.map((row, u) =>
          row.map((m, v) => (
            <rect
              key={`${u}-${v}`}
              x={v * cell}
              y={u * cell}
              width={cell + 0.5}
              height={cell + 0.5}
              fill={`rgba(110, 177, 255, ${(0.05 + 0.9 * Math.min(1, m)).toFixed(3)})`}
            >
              <title>χ(u={u}, v={v}) magnitude = {m.toFixed(4)}</title>
            </rect>
          )),
        )}
      </svg>
      <div className="charf__legend">|χ(u,v)| — rows = X-support u, cols = Z-support v · brighter = more phase-space weight</div>
    </div>
  );
}
