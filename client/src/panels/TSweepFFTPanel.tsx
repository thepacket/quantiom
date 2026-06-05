import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { tSweepSpectrum } from "../sim/tsweep";
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
const POINTS = 128;
const SHOW_BINS = 16; // skip DC, show bins 1..16

const LINE_COLORS = [
  "#4f9eff", "#ff9a5a", "#7ee787", "#e08bff",
  "#ffd24f", "#5ad1d1", "#ff7a9c", "#b0b8c4",
];

/**
 * Fourier spectrum of the ⟨Z_q⟩(t) traces. Runs a real DFT of each qubit's
 * ⟨Z⟩(t) over one period of the `t` clock and plots the amplitude at each
 * integer frequency bin (oscillations per period). Reads off the dominant
 * Rabi / Larmor / Floquet frequencies as peaks: a single rx(t) shows one
 * peak at bin 1, a doubled-frequency drive at bin 2, a Floquet
 * period-doubling response feeds the low bins.
 *
 * The DC bin (time-average) is omitted so the oscillatory content is on a
 * useful scale. Only meaningful with a free `t` symbol; statevector path,
 * capped at 14 qubits, default-collapsed.
 */
export function TSweepFFTPanel(props: Props) {
  return (
    <PanelShell id="t-sweep-fft" title="t-sweep spectrum" defaultCollapsed>
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
    return tSweepSpectrum(circuit, paramValues, customGates, POINTS, MAX_QUBITS);
  }, [collapsed, hasT, data, n, circuit, paramValues, customGates]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (!hasT) {
    return <div className="panel__notice">No <code>t</code> parameter — add a gate like <code>rx(t)</code> and this reads off its oscillation frequencies.</div>;
  }
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no Bloch vectors to transform.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — spectrum from a single trajectory isn't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the t-sweep spectrum is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;

  return <Spectrum mag={result.mag} />;
}

const W = 300;
const H = 120;
const PAD_L = 26;
const PAD_B = 16;
const PAD_T = 6;

function Spectrum({ mag }: { mag: number[][] }) {
  const n = mag.length;
  const bins = Math.min(SHOW_BINS, (mag[0]?.length ?? 1) - 1);
  // Peak across all qubits over the displayed (AC) bins, for the y-scale.
  let yMax = 1e-9;
  for (let q = 0; q < n; q++) for (let m = 1; m <= bins; m++) yMax = Math.max(yMax, mag[q][m]);

  const plotW = W - PAD_L - 4;
  const plotH = H - PAD_T - PAD_B;
  const groupW = plotW / bins;
  const bw = Math.max(1.5, groupW / n - 0.5);
  const xOf = (m: number) => PAD_L + (m - 1) * groupW;
  const yOf = (v: number) => PAD_T + (1 - v / yMax) * plotH;

  return (
    <div className="tsweepfft">
      <svg viewBox={`0 0 ${W} ${H}`} className="tsweepfft__svg plot-fill" role="img">
        <line x1={PAD_L} y1={yOf(0)} x2={W - 4} y2={yOf(0)} className="tsweepfft__grid" />
        <line x1={PAD_L} y1={yOf(yMax)} x2={W - 4} y2={yOf(yMax)} className="tsweepfft__grid" />
        <text x={PAD_L - 4} y={yOf(yMax) + 3} textAnchor="end" className="tsweepfft__axis">{yMax.toFixed(2)}</text>
        <text x={PAD_L - 4} y={yOf(0) + 3} textAnchor="end" className="tsweepfft__axis">0</text>
        {Array.from({ length: bins }, (_, b) => {
          const m = b + 1;
          return (
            <g key={m}>
              {Array.from({ length: n }, (_, q) => {
                const v = mag[q][m];
                const h = (v / yMax) * plotH;
                const x = xOf(m) + 2 + q * (bw + 0.5);
                return (
                  <rect key={q} x={x} y={yOf(0) - h} width={bw} height={h} fill={LINE_COLORS[q % LINE_COLORS.length]}>
                    <title>q{q}, bin {m}: amp = {v.toFixed(4)}</title>
                  </rect>
                );
              })}
              {(m % 2 === 1 || bins <= 8) && (
                <text x={xOf(m) + groupW / 2} y={H - 3} textAnchor="middle" className="tsweepfft__axis">{m}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="tsweepfft__legend">
        <span className="tsweepfft__note">freq = oscillations / period</span>
        {mag.map((_, q) => (
          <span key={q}><span className="tsweepfft__swatch" style={{ background: LINE_COLORS[q % LINE_COLORS.length] }} /> q{q}</span>
        ))}
      </div>
    </div>
  );
}
