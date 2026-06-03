import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { discreteWigner } from "../sim/wigner";

type Props = { state: SimState };

const MAX_QUBITS = 4;

/**
 * Discrete Wigner function — the qubit phase-space quasi-probability on the
 * 2ⁿ × 2ⁿ grid. Blue cells are positive, warm cells **negative**;
 * negativity is the non-classicality signal. W sums to 1.
 *
 * Single-qubit stabilizer states are non-negative and magic states go
 * negative; for n ≥ 2 the tensor-product construction isn't
 * Clifford-covariant, so read W as a phase-space picture and lean on the
 * Magic (M₂) panel for the rigorous stabilizer measure. Statevector path
 * only, capped at 4 qubits, default-collapsed.
 */
export function WignerPanel({ state }: Props) {
  return (
    <PanelShell id="wigner" title="Wigner function" defaultCollapsed>
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
    return discreteWigner(data.state, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector for the Wigner transform.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — Wigner from a single trajectory isn't meaningful.</div>;
  }
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the Wigner grid is capped at {MAX_QUBITS} (16×16).</div>;
  }
  if (!result) return null;

  return <Grid result={result} />;
}

const MAX_PX = 224;

function Grid({ result }: { result: { W: number[][]; dim: number; negativity: number; minW: number } }) {
  const { W, dim, negativity, minW } = result;
  const cell = Math.max(6, Math.min(28, Math.floor(MAX_PX / dim)));
  const size = dim * cell;
  // Symmetric scale so opacity = |W| / max(|W|).
  let mx = 1e-9;
  for (let r = 0; r < dim; r++) for (let c = 0; c < dim; c++) mx = Math.max(mx, Math.abs(W[r][c]));

  return (
    <div className="wigner">
      <div className="wigner__stats">
        <span>negativity <b>{negativity.toFixed(3)}</b></span>
        <span>min W <b>{minW.toFixed(3)}</b></span>
        <span className={negativity > 1e-6 ? "wigner__tag wigner__tag--neg" : "wigner__tag"}>
          {negativity > 1e-6 ? "non-classical" : "non-negative"}
        </span>
      </div>
      <svg width={size} height={size} className="wigner__svg" role="img">
        <rect width={size} height={size} className="wigner__bg" />
        {W.map((rowArr, r) =>
          rowArr.map((v, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={v >= 0 ? "var(--accent-2)" : "#ff7a5a"}
              fillOpacity={Math.min(1, Math.abs(v) / mx)}
            >
              <title>W[{r},{c}] = {v.toFixed(4)}</title>
            </rect>
          )),
        )}
      </svg>
      <div className="wigner__legend">
        <span><span className="wigner__swatch" style={{ background: "var(--accent-2)" }} /> W &gt; 0</span>
        <span><span className="wigner__swatch" style={{ background: "#ff7a5a" }} /> W &lt; 0 (non-classical)</span>
      </div>
    </div>
  );
}
