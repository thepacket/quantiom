import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { entropyProfile } from "../sim/entanglement";

type Props = { state: SimState };

const MAX_SIDE = 8;

/**
 * Entanglement-entropy profile across every contiguous bipartition. Plots
 * S(ρ_{[0..k]}) against the cut position k — the area-law vs volume-law
 * diagnostic. A product state is flat at zero; a gapped ground state
 * saturates after a couple of sites (area law); a thermalised /
 * volume-law state traces the symmetric Page arch peaking at the centre.
 *
 * The dashed line is the per-cut maximum min(|A|, |B|) bits. Reuses
 * `entanglement.ts`; diagonalises the smaller side of each cut, capped at
 * 8 qubits there. Statevector path only, default-collapsed.
 */
export function EntropyProfilePanel({ state }: Props) {
  return (
    <PanelShell id="entropy-profile" title="Entropy profile" defaultCollapsed>
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
    if (n < 2) return null;
    return entropyProfile(data.state, n, MAX_SIDE);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits for a cut</div>;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector for the reduced density matrices.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — entropy from a single trajectory isn't meaningful.</div>;
  }
  if (!result) return null;

  return <Profile result={result} n={n} />;
}

const W = 300;
const H = 130;
const PAD_L = 26;
const PAD_B = 18;
const PAD_T = 8;

function Profile({ result, n }: { result: { entropy: number[]; maxEntropy: number[] }; n: number }) {
  const { entropy, maxEntropy } = result;
  const cuts = entropy.length; // n − 1
  const yMax = Math.max(1, ...maxEntropy);
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_T - PAD_B;
  // Cut k sits between qubit k and k+1; place it at fractional position.
  const xOf = (k: number) => PAD_L + (cuts === 1 ? plotW / 2 : (k / (cuts - 1)) * plotW);
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;

  const defined = entropy.map((v, k) => ({ k, v })).filter((p) => Number.isFinite(p.v));
  const linePts = defined.map((p) => `${xOf(p.k).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(" ");
  const boundPts = maxEntropy.map((v, k) => `${xOf(k).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const peak = Math.max(0, ...defined.map((p) => p.v));

  return (
    <div className="entprof">
      <div className="entprof__stats">
        <span>peak S = <b>{peak.toFixed(3)}</b> bit</span>
        <span>cuts <b>{cuts}</b></span>
      </div>
      <svg width={W} height={H} className="entprof__svg" role="img">
        {/* y grid: 0 and yMax */}
        <line x1={PAD_L} y1={yOf(0)} x2={W - 6} y2={yOf(0)} className="entprof__grid" />
        <line x1={PAD_L} y1={yOf(yMax)} x2={W - 6} y2={yOf(yMax)} className="entprof__grid" />
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="entprof__axis">0</text>
        <text x={PAD_L - 4} y={yOf(yMax) + 3} textAnchor="end" className="entprof__axis">{yMax}</text>
        {/* max-entropy bound */}
        <polyline points={boundPts} fill="none" className="entprof__bound" />
        {/* entropy curve + markers */}
        <polyline points={linePts} fill="none" className="entprof__line" />
        {defined.map((p) => (
          <circle key={p.k} cx={xOf(p.k)} cy={yOf(p.v)} r={2.5} className="entprof__dot">
            <title>cut {p.k}|{p.k + 1}: S = {p.v.toFixed(4)} bit (max {maxEntropy[p.k]})</title>
          </circle>
        ))}
        {/* x labels: first and last cut */}
        <text x={xOf(0)} y={H - 4} textAnchor="middle" className="entprof__axis">0|1</text>
        <text x={xOf(cuts - 1)} y={H - 4} textAnchor="middle" className="entprof__axis">{n - 2}|{n - 1}</text>
      </svg>
      <div className="entprof__legend">
        <span><span className="entprof__swatch entprof__swatch--line" /> S(ρ_A)</span>
        <span><span className="entprof__swatch entprof__swatch--bound" /> max = min(|A|,|B|)</span>
      </div>
    </div>
  );
}
