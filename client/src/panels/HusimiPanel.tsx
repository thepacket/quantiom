import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { husimiQ } from "../sim/husimi";

type Props = { state: SimState };

const MAX_QUBITS = 7;
const N_THETA = 33;
const N_PHI = 64;

/**
 * Spin coherent-state Husimi Q-function Q(θ,φ) = |⟨θ,φ|ψ⟩|² as a (θ,φ)
 * heatmap — the qubit/CV analogue of the optical Husimi-Q. It is the
 * everywhere-**non-negative** phase-space picture (the complement to the
 * Wigner panel, which can go negative): a single bright lobe for a product
 * state at its Bloch direction, two antipodal lobes for a GHZ "cat", an
 * equatorial band that pinches for a spin-squeezed state.
 *
 * Most physical for permutation-symmetric states (Dicke / GHZ /
 * spin-squeezed); for a general state it's still the valid projection onto
 * product coherent directions. Statevector path only, capped at 7 qubits,
 * default-collapsed.
 */
export function HusimiPanel({ state }: Props) {
  return (
    <PanelShell id="husimi" title="Husimi Q (spin)" defaultCollapsed>
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
    return husimiQ(data.state, n, N_THETA, N_PHI, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no statevector for the coherent-state overlaps.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — Husimi from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the Husimi map is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <HeatMap Q={result.Q} nTheta={result.nTheta} nPhi={result.nPhi} max={result.max} />;
}

const W = 256;
const H = 130;
const PAD_L = 22;
const PAD_B = 14;

function HeatMap({ Q, nTheta, nPhi, max }: { Q: number[][]; nTheta: number; nPhi: number; max: number }) {
  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_B - 4;
  const cw = plotW / nPhi;
  const ch = plotH / nTheta;
  const scale = max > 1e-12 ? 1 / max : 1;

  return (
    <div className="husimi">
      <svg width={W} height={H} className="husimi__svg" role="img">
        {Q.map((row, it) =>
          row.map((v, ip) => {
            const o = v * scale;
            if (o < 0.02) return null;
            return (
              <rect
                key={`${it}-${ip}`}
                x={PAD_L + ip * cw}
                y={4 + it * ch}
                width={cw + 0.5}
                height={ch + 0.5}
                fill="var(--accent)"
                fillOpacity={o}
              >
                <title>θ={((Math.PI * it) / (nTheta - 1) * 180 / Math.PI).toFixed(0)}°, φ={((2 * Math.PI * ip) / nPhi * 180 / Math.PI).toFixed(0)}°: Q={v.toFixed(4)}</title>
              </rect>
            );
          }),
        )}
        {/* axis labels */}
        <text x={PAD_L - 4} y={8} textAnchor="end" className="husimi__axis">θ=0</text>
        <text x={PAD_L - 4} y={4 + plotH} textAnchor="end" className="husimi__axis">π</text>
        <text x={PAD_L} y={H - 2} textAnchor="start" className="husimi__axis">φ=0</text>
        <text x={W - 4} y={H - 2} textAnchor="end" className="husimi__axis">2π</text>
      </svg>
      <div className="husimi__legend">Q(θ,φ) = |⟨θ,φ|ψ⟩|² — non-negative; θ=0 is |0…0⟩, brighter = more weight</div>
    </div>
  );
}
