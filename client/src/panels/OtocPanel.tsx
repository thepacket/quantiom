import { useMemo, useState, useEffect } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { otoc } from "../sim/otoc";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 6;
const POINTS = 48;

/**
 * Out-of-time-order correlator C(t) = 1 − Re⟨W(t)·V·W(t)·V⟩ over the `t`
 * clock — the scrambling / operator-spreading diagnostic. W = Z on the
 * "butterfly" qubit, V = Z on the "measure" qubit. C(t) stays near 0 while
 * the two operators still commute and rises toward 1 as the butterfly
 * front reaches the measure qubit; the rise time over their separation is
 * the butterfly velocity.
 *
 * Only meaningful with a free `t` symbol; statevector path. Builds the
 * dense unitary at each sample, so capped at 6 qubits, default-collapsed.
 */
export function OtocPanel(props: Props) {
  return (
    <PanelShell id="otoc" title="OTOC (scrambling)" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
  const hasT = !!data?.freeSymbols?.includes("t");
  const [wq, setWq] = useState(0);
  const [vq, setVq] = useState(0);

  useEffect(() => {
    // Default V to the last qubit so the cone has somewhere to spread to.
    setWq((p) => (p < n ? p : 0));
    setVq((p) => (p < n && p > 0 ? p : Math.max(0, n - 1)));
  }, [n]);

  const result = useMemo(() => {
    if (collapsed || !hasT) return null;
    if (data?.isStabilizer || data?.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return otoc(circuit, paramValues, customGates, wq, vq, "Z", "Z", POINTS, MAX_QUBITS);
  }, [collapsed, hasT, data, n, circuit, paramValues, customGates, wq, vq]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (!hasT) {
    return <div className="panel__notice">No <code>t</code> parameter — add a time-dependent gate like <code>rzz(t)</code> and this traces operator scrambling over one period.</div>;
  }
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — build the dense unitary needs the statevector simulator.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — OTOC from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the OTOC is capped at {MAX_QUBITS} (it builds the dense unitary per sample).</div>;

  return (
    <div className="otoc">
      <div className="otoc__controls">
        <label>W (Z) on q
          <select value={wq} onChange={(e) => setWq(Number(e.target.value))}>
            {Array.from({ length: n }, (_, q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </label>
        <label>V (Z) on q
          <select value={vq} onChange={(e) => setVq(Number(e.target.value))}>
            {Array.from({ length: n }, (_, q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </label>
      </div>
      {result ? <Plot C={result.C} /> : <div className="panel__placeholder">computing…</div>}
    </div>
  );
}

const W = 300;
const H = 110;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 6;

function Plot({ C }: { C: number[] }) {
  const points = C.length;
  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_T - PAD_B;
  const yMax = Math.max(1, ...C);
  const xOf = (k: number) => PAD_L + (k / (points - 1)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const pts = C.map((v, k) => `${xOf(k).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const peak = Math.max(...C);

  return (
    <>
      <div className="otoc__stats"><span>peak C = <b>{peak.toFixed(3)}</b></span></div>
      <svg width={W} height={H} className="otoc__svg" role="img">
        <line x1={PAD_L} y1={yOf(0)} x2={W - 4} y2={yOf(0)} className="otoc__grid" />
        <line x1={PAD_L} y1={yOf(yMax)} x2={W - 4} y2={yOf(yMax)} className="otoc__grid" />
        <text x={PAD_L - 4} y={yOf(yMax) + 3} textAnchor="end" className="otoc__axis">{yMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="otoc__axis">0</text>
        <text x={PAD_L} y={H - 3} textAnchor="start" className="otoc__axis">t=0</text>
        <text x={W - 4} y={H - 3} textAnchor="end" className="otoc__axis">2π</text>
        <polyline points={pts} fill="none" className="otoc__line" />
      </svg>
      <div className="otoc__note">C(t) = 1 − Re⟨W(t)·V·W(t)·V⟩ on |0…0⟩ — rise = scrambling</div>
    </>
  );
}
