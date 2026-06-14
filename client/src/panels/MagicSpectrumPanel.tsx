import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { allPauliExpectations } from "../sim/pauliSpectrum";
import { magicSpectrum, type MagicSpectrumResult } from "../sim/magicSpectrum";

type Props = { state: SimState };
const MAX_QUBITS = 6;

/**
 * Magic spectrum — the stabilizer-Rényi nonstabilizerness M_α swept over the
 * Rényi index α, generalising the single M₂ of the Magic panel. M_α ≥ 0 and
 * vanishes for every α iff the state is a stabilizer state; the curve's shape
 * distinguishes states with equal M₂ but different magic structure.
 * Statevector path, n ≤ 6, default-collapsed.
 */
export function MagicSpectrumPanel({ state }: Props) {
  return (
    <PanelShell id="magic-spectrum" title="Magic spectrum M_α" defaultCollapsed>
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
    const exp = allPauliExpectations(data.state, n);
    return magicSpectrum(exp, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — stabilizer state, M_α = 0 by construction.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — magic from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — magic spectrum is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <Plot r={result} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: MagicSpectrumResult }) {
  const { alphas, m, m2 } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const aMax = alphas[alphas.length - 1];
  const aMin = alphas[0];
  const mMax = Math.max(0.01, ...m);
  const xOf = (a: number) => PAD_L + ((a - aMin) / (aMax - aMin || 1)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / mMax) * plotH;
  const path = m.map((v, i) => `${xOf(alphas[i]).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  return (
    <div className="magsp__out">
      <div className="magsp__stats">
        <span>M₂ = <b>{m2.toFixed(3)}</b></span>
        <span className="magsp__tag">{m2 < 1e-3 ? "stabilizer state" : "has magic"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="magsp__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="magsp__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="magsp__axis-line" />
        <polyline points={path} className="magsp__curve" />
        {m.map((v, i) => <circle key={i} cx={xOf(alphas[i])} cy={yOf(v)} r={2.2} className="magsp__dot"><title>M_{alphas[i]} = {v.toFixed(4)}</title></circle>)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="magsp__axis">{mMax.toFixed(2)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="magsp__axis">0</text>
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 6} textAnchor="middle" className="magsp__axis">Rényi index α →</text>
      </svg>
      <div className="magsp__legend">stabilizer-Rényi entropy M_α (magic bits) · 0 for all α ⇒ stabilizer state</div>
    </div>
  );
}
