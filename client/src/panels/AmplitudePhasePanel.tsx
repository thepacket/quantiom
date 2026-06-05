import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { useEndianness, displayAmplitudes } from "./endianness";

type Props = { state: SimState };

const MAX_BARS = 64;

/**
 * Amplitude–phase plot. One horizontal bar per computational basis state:
 * length is the amplitude magnitude |⟨x|ψ⟩|, colour (hue) is its phase
 * arg⟨x|ψ⟩. This
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

const ROW_H = 16;       // height per basis-state row
const BAR_H = 11;       // bar thickness within a row
const LABEL_W = 42;     // left gutter for the basis / index label
const PAD = 6;
const TARGET_W = 300;   // design width; the SVG scales to fill the panel

function Plot({ bars, truncated, total }: { bars: Bar[]; truncated: boolean; total: number }) {
  const useBasis = bars.length <= 16; // full basis labels when few; indices when many
  const barArea = TARGET_W - LABEL_W - 6;
  const W = TARGET_W;
  const H = PAD * 2 + bars.length * ROW_H;
  const maxMag = Math.max(1e-9, ...bars.map((b) => b.mag));

  return (
    <div className="ampphase">
      <svg viewBox={`0 0 ${W} ${H}`} className="ampphase__svg plot-fill" role="img">
        {/* magnitude baseline (left edge of the bars) */}
        <line x1={LABEL_W} y1={PAD} x2={LABEL_W} y2={H - PAD} className="ampphase__axis-line" />
        {bars.map((b, k) => {
          const y = PAD + k * ROW_H;
          const len = (b.mag / maxMag) * barArea;
          return (
            <g key={b.index}>
              <text x={LABEL_W - 4} y={y + ROW_H / 2 + 3} textAnchor="end" className="ampphase__axis">
                {useBasis ? b.basis : b.index}
              </text>
              <rect x={LABEL_W} y={y + (ROW_H - BAR_H) / 2} width={Math.max(0, len)} height={BAR_H} fill={hueFor(b.phase)}>
                <title>|{b.basis}⟩: |amp| = {b.mag.toFixed(4)}, arg = {(b.phase * 180 / Math.PI).toFixed(0)}°</title>
              </rect>
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
