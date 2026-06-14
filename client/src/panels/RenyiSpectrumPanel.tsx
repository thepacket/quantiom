import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { renyiSpectrum, type RenyiSpectrumResult } from "../sim/renyiSpectrum";

type Props = { state: SimState };
const MAX_SIDE = 6;

/**
 * Rényi entanglement-entropy spectrum S_α(ρ_A) vs the Rényi index α across a
 * chosen cut. A flat curve signals a near-uniform (volume-law) entanglement
 * spectrum; a steep one means a few dominant Schmidt weights. The α→0 limit
 * is the log Schmidt rank, α→∞ the min-entropy. Statevector path, smaller
 * side ≤ 6, default-collapsed.
 */
export function RenyiSpectrumPanel({ state }: Props) {
  return (
    <PanelShell id="renyi-spectrum" title="Rényi entropy spectrum" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [inA, setInA] = useState<boolean[]>([]);

  useEffect(() => {
    setInA((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<boolean>(n).fill(false);
      for (let i = 0; i < Math.floor(n / 2); i++) next[i] = true;
      return next;
    });
  }, [n]);

  const subsetA = useMemo(() => inA.flatMap((on, i) => (on ? [i] : [])), [inA]);
  const smallSide = Math.min(subsetA.length, n - subsetA.length);

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (subsetA.length === 0 || subsetA.length >= n || smallSide > MAX_SIDE) return null;
    return renyiSpectrum(data.state, n, subsetA, undefined, MAX_SIDE);
  }, [collapsed, data, n, subsetA, smallSide]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer)
    return <div className="panel__notice">Clifford fast path — needs the statevector reduced density matrix.</div>;
  if (data.isNoisy)
    return <div className="panel__notice">Noise mode on — Rényi spectrum from a single trajectory isn't meaningful.</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="renyi">
      <div className="renyi__cut">
        <span className="renyi__cut-label">cut A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"renyi__qubit" + (inA[q] ? " renyi__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {subsetA.length === 0 || subsetA.length >= n ? (
        <div className="panel__placeholder">select a proper subset.</div>
      ) : smallSide > MAX_SIDE ? (
        <div className="panel__notice">smaller side {smallSide} qubits — capped at {MAX_SIDE}.</div>
      ) : result ? (
        <Plot r={result} />
      ) : null}
    </div>
  );
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function Plot({ r }: { r: RenyiSpectrumResult }) {
  const { alphas, entropies, vonNeumann, min } = r;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const aMax = alphas[alphas.length - 1];
  const sMax = Math.max(0.01, ...entropies);
  const xOf = (a: number) => PAD_L + (a / aMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v / sMax) * plotH;
  const path = entropies.map((v, i) => `${xOf(alphas[i]).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  return (
    <div className="renyi__out">
      <div className="renyi__stats">
        <span>S₁ = <b>{vonNeumann.toFixed(3)}</b></span>
        <span>S∞ = <b>{min.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="renyi__svg plot-fill" role="img">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="renyi__axis-line" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="renyi__axis-line" />
        <line x1={xOf(1)} y1={PAD_T} x2={xOf(1)} y2={H - PAD_B} className="renyi__mark" />
        <polyline points={path} className="renyi__curve" />
        {entropies.map((v, i) => <circle key={i} cx={xOf(alphas[i])} cy={yOf(v)} r={2} className="renyi__dot" />)}
        <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="renyi__axis">{sMax.toFixed(1)}</text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="renyi__axis">0</text>
        <text x={xOf(1)} y={H - 6} textAnchor="middle" className="renyi__axis">α=1</text>
        <text x={W - PAD_R} y={H - 6} textAnchor="end" className="renyi__axis">α→</text>
      </svg>
      <div className="renyi__legend">S_α(ρ_A) · flat ⇒ uniform (volume-law) spectrum, steep ⇒ few dominant weights</div>
    </div>
  );
}
