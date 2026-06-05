import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { loschmidtEcho } from "../sim/loschmidt";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 14;
const POINTS = 96;

/**
 * Loschmidt echo L(t) = |⟨ψ(0)|ψ(t)⟩|² over one period of the `t` clock —
 * how close the evolving state stays to where it started. The rate
 * function λ(t) = −(1/n) ln L(t) is overlaid (scaled): its **cusps** mark
 * the critical times of a dynamical quantum phase transition (DQPT), where
 * L(t) touches zero and λ(t) kinks.
 *
 * Only meaningful with a free `t` symbol; statevector path, capped at 14
 * qubits, default-collapsed. One simulation per sample point.
 */
export function LoschmidtPanel(props: Props) {
  return (
    <PanelShell id="loschmidt" title="Loschmidt echo" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
  const hasT = !!data?.freeSymbols?.includes("t");

  const result = useMemo(() => {
    if (collapsed || !hasT) return null;
    if (data?.isStabilizer || data?.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return loschmidtEcho(circuit, paramValues, customGates, POINTS, MAX_QUBITS);
  }, [collapsed, hasT, data, n, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (!hasT) {
    return <div className="panel__notice">No <code>t</code> parameter — add a time-dependent gate like <code>rx(t)</code> and this traces the return probability over one period.</div>;
  }
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no statevector for the overlap.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — echo from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the Loschmidt echo is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Plot L={result.L} rate={result.rate} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 6;

function Plot({ L, rate }: { L: number[]; rate: number[] }) {
  const points = L.length;
  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_T - PAD_B;
  const xOf = (k: number) => PAD_L + (k / (points - 1)) * plotW;
  const yL = (v: number) => PAD_T + (1 - v) * plotH; // L ∈ [0,1]
  const rateMax = Math.max(1e-9, ...rate.filter((r) => Number.isFinite(r)));
  const yR = (v: number) => PAD_T + (1 - Math.min(1, v / rateMax)) * plotH;

  const lPts = L.map((v, k) => `${xOf(k).toFixed(1)},${yL(v).toFixed(1)}`).join(" ");
  const rPts = rate.map((v, k) => `${xOf(k).toFixed(1)},${yR(v).toFixed(1)}`).join(" ");
  const minL = Math.min(...L);

  return (
    <div className="loschmidt">
      <div className="loschmidt__stats">
        <span>min L = <b>{minL.toFixed(3)}</b></span>
        {minL < 1e-3 && <span className="loschmidt__tag">DQPT: L→0</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="loschmidt__svg plot-fill" role="img">
        <line x1={PAD_L} y1={yL(1)} x2={W - 4} y2={yL(1)} className="loschmidt__grid" />
        <line x1={PAD_L} y1={yL(0)} x2={W - 4} y2={yL(0)} className="loschmidt__grid" />
        <text x={PAD_L - 4} y={yL(1) + 3} textAnchor="end" className="loschmidt__axis">1</text>
        <text x={PAD_L - 4} y={yL(0) + 3} textAnchor="end" className="loschmidt__axis">0</text>
        <text x={PAD_L} y={H - 3} textAnchor="start" className="loschmidt__axis">t=0</text>
        <text x={W - 4} y={H - 3} textAnchor="end" className="loschmidt__axis">2π</text>
        <polyline points={rPts} fill="none" className="loschmidt__rate" />
        <polyline points={lPts} fill="none" className="loschmidt__echo" />
      </svg>
      <div className="loschmidt__legend">
        <span><span className="loschmidt__swatch loschmidt__swatch--echo" /> L(t) return prob.</span>
        <span><span className="loschmidt__swatch loschmidt__swatch--rate" /> λ(t) rate (scaled) — cusps = DQPT</span>
      </div>
    </div>
  );
}
