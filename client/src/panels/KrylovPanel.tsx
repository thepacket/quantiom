import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
import { krylovComplexity, MAX_KRYLOV_QUBITS, type KrylovResult } from "../sim/krylov";

type Props = { state: SimState };

const PRESETS: Record<string, string> = {
  "Tilted Ising (chaotic, 3q)": "-1*ZZI - 1*IZZ + 0.9045*XII + 0.9045*IXI + 0.9045*IIX + 0.809*ZII + 0.809*IZI + 0.809*IIZ",
  "Transverse Ising (3q)": "-1*ZZI - 1*IZZ - 1*XII - 1*IXI - 1*IIX",
  "Heisenberg (3q)": "1*XXI + 1*IXX + 1*YYI + 1*IYY + 1*ZZI + 1*IZZ",
};

/**
 * Krylov / spread complexity under a Pauli-sum H. Lanczos on the Krylov chain
 * gives the operator-growth coefficients bₙ (top), and the spread complexity
 * C(t) = Σ n|⟨Kₙ|ψ(t)⟩|² (main curve) tracks how far the evolving state
 * spreads along that chain — rise, peak, then a late-time plateau. Linearly
 * growing bₙ is the chaotic / maximal-growth signature. n ≤ 6.
 */
export function KrylovPanel({ state }: Props) {
  return (
    <PanelShell id="krylov" title="Krylov complexity" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [text, setText] = useState(PRESETS["Tilted Ising (chaotic, 3q)"]);

  const parsed = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || n < 1 || n > MAX_KRYLOV_QUBITS) return null;
    try {
      const terms = parsePauliSum(text);
      if (terms.length === 0) return { error: "no terms" };
      const hn = pauliSumQubitCount(terms);
      if (hn !== n) return { error: `H is on ${hn} qubits but the circuit has ${n} — match them` };
      const res = krylovComplexity(terms, data.state, n);
      if (!res) return { error: "could not build the Krylov space" };
      return { res };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [collapsed, data, n, text]) as
    | null
    | { error: string; res?: undefined }
    | { error?: undefined; res: KrylovResult };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the statevector.</div>;
  if (n > MAX_KRYLOV_QUBITS)
    return <div className="panel__notice">{n} qubits — Krylov complexity is capped at {MAX_KRYLOV_QUBITS}.</div>;

  return (
    <div className="kry">
      <div className="kry__presets">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className="kry__preset" onClick={() => setText(PRESETS[name])}>{name}</button>
        ))}
      </div>
      <textarea className="kry__input" value={text} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false} />
      {parsed?.error && <div className="panel__notice">{parsed.error}</div>}
      {parsed?.res && <Plots r={parsed.res} />}
    </div>
  );
}

const W = 300;

function Plots({ r }: { r: KrylovResult }) {
  return (
    <div className="kry__out">
      <div className="kry__stats">
        <span>Krylov dim <b>{r.krylovDim}</b></span>
        <span>peak C <b>{r.maxComplexity.toFixed(2)}</b></span>
      </div>
      <BCoeffs b={r.b} />
      <Complexity times={r.times} c={r.complexity} cap={r.krylovDim - 1} />
      <div className="kry__legend">top: Lanczos bₙ (operator growth) · bottom: spread complexity C(t)</div>
    </div>
  );
}

function BCoeffs({ b }: { b: number[] }) {
  const H = 46, PAD_L = 26, PAD_R = 6, PAD_T = 8, PAD_B = 14;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const m = b.length;
  const bMax = Math.max(1e-9, ...b);
  const slot = plotW / Math.max(1, m);
  const bw = Math.max(1.5, slot * 0.7);
  const yOf = (v: number) => PAD_T + (1 - v / bMax) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="kry__svg plot-fill" role="img">
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="kry__axis-line" />
      {b.map((v, i) => (
        <rect key={i} x={(PAD_L + slot * (i + 0.5) - bw / 2).toFixed(1)} y={yOf(v).toFixed(1)} width={bw.toFixed(1)} height={(H - PAD_B - yOf(v)).toFixed(1)} className="kry__bar" />
      ))}
      <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="kry__axis">{bMax.toFixed(1)}</text>
      <text x={PAD_L} y={H - 4} textAnchor="start" className="kry__axis">b₁</text>
      <text x={W - PAD_R} y={H - 4} textAnchor="end" className="kry__axis">bₙ</text>
    </svg>
  );
}

function Complexity({ times, c, cap }: { times: number[]; c: number[]; cap: number }) {
  const H = 84, PAD_L = 26, PAD_R = 6, PAD_T = 8, PAD_B = 16;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const tMax = times[times.length - 1] || 1;
  const yMax = Math.max(cap, ...c, 1e-9);
  const xOf = (t: number) => PAD_L + (t / tMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;
  const path = c.map((v, i) => `${xOf(times[i]).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="kry__svg plot-fill" role="img">
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="kry__axis-line" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="kry__axis-line" />
      <polyline points={path} className="kry__curve" />
      <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="kry__axis">{yMax.toFixed(1)}</text>
      <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="kry__axis">0</text>
      <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} textAnchor="middle" className="kry__axis">C(t) vs time →</text>
    </svg>
  );
}
