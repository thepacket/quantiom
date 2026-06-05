import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { useEndianness, displayAmplitudes } from "./endianness";

type Props = { state: SimState };

const MAX_BARS = 64;

/**
 * Amplitude–phase plot. One bar per computational basis state: height is
 * the amplitude magnitude |⟨x|ψ⟩|, colour (hue) is its phase arg⟨x|ψ⟩. This
 * is the one view that shows the *full-state* phase — the Bloch / phase-disk
 * panels only show per-qubit phase, and the statevector table shows raw
 * numbers. Here interference is visible at a glance: Grover's sign flip on
 * the marked state, QFT's phase staircase, phase kickback onto an ancilla.
 *
 * When 2ⁿ exceeds the bar cap, shows the largest-magnitude basis states
 * (in index order). Statevector path only, default-collapsed.
 */
export function AmplitudePhasePanel({ state }: Props) {
  return (
    <PanelShell id="amp-phase" title="Amplitude · phase" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

type Bar = { basis: string; index: number; mag: number; phase: number };

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const { endian } = useEndianness();
  const data = dataOf(state);

  const bars = useMemo<Bar[] | null>(() => {
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    const all = displayAmplitudes(data.amplitudes, data.numQubits, endian).map((a) => ({
      basis: a.basis,
      index: a.index,
      mag: Math.hypot(a.re, a.im),
      phase: Math.atan2(a.im, a.re),
    }));
    if (all.length <= MAX_BARS) return all;
    // Too many: keep the largest-magnitude states, then restore index order.
    return [...all]
      .sort((p, q) => q.mag - p.mag)
      .slice(0, MAX_BARS)
      .sort((p, q) => p.index - q.index);
  }, [collapsed, data, endian]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (data.isStabilizer) {
    return <div className="panel__notice">Clifford fast path — no statevector amplitudes to plot.</div>;
  }
  if (data.isNoisy) {
    return <div className="panel__notice">Noise mode on — amplitudes from a single trajectory aren't meaningful.</div>;
  }
  if (!bars) return null;

  const truncated = data.amplitudes.length > MAX_BARS;
  return <Plot bars={bars} truncated={truncated} total={data.amplitudes.length} />;
}

/** Phase (−π..π] → hue around the colour wheel. */
function hueFor(phase: number): string {
  const deg = ((phase + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${deg.toFixed(0)}, 70%, 58%)`;
}

const H = 96;
const PAD_T = 6;

function Plot({ bars, truncated, total }: { bars: Bar[]; truncated: boolean; total: number }) {
  const labelEvery = bars.length <= 16 ? 1 : Math.ceil(bars.length / 16);
  const bw = Math.max(3, Math.min(18, Math.floor(300 / bars.length) - 1));
  const W = Math.max(120, bars.length * (bw + 1) + 2);
  const plotH = H - PAD_T - 12;
  const maxMag = Math.max(1e-9, ...bars.map((b) => b.mag));

  return (
    <div className="ampphase">
      <svg width={W} height={H} className="ampphase__svg" role="img">
        <line x1={0} y1={PAD_T + plotH} x2={W} y2={PAD_T + plotH} className="ampphase__axis-line" />
        {bars.map((b, k) => {
          const h = (b.mag / maxMag) * plotH;
          const x = 1 + k * (bw + 1);
          return (
            <g key={b.index}>
              <rect x={x} y={PAD_T + plotH - h} width={bw} height={h} fill={hueFor(b.phase)}>
                <title>|{b.basis}⟩: |amp| = {b.mag.toFixed(4)}, arg = {(b.phase * 180 / Math.PI).toFixed(0)}°</title>
              </rect>
              {k % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 2} textAnchor="middle" className="ampphase__axis">
                  {bars.length <= 16 ? b.basis : b.index}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="ampphase__legend">
        <span>phase:</span>
        <span className="ampphase__hue" />
        <span>−π</span>
        <span style={{ marginLeft: "auto" }}>+π</span>
      </div>
      {truncated && (
        <div className="ampphase__more">showing top {MAX_BARS} of {total} basis states by magnitude</div>
      )}
    </div>
  );
}
