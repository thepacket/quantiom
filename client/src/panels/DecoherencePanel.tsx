import { useEffect, useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { decoherenceByDepth, MAX_DECOHERENCE_QUBITS, type DecoherenceByDepth } from "../sim/decoherence";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  noise: NoiseModel;
};

/**
 * Decoherence movie. Steps through the circuit column by column and, at each
 * depth, shows the trajectory-averaged measurement distribution under the
 * noise model. As the loop advances and noise accumulates, the histogram's
 * sharp ideal peaks decay toward the dashed uniform (maximally-mixed) line —
 * decoherence, animated. Opt-in (default-collapsed) and noise-mode only.
 */
export function DecoherencePanel(props: Props) {
  return (
    <PanelShell id="decoherence" title="Decoherence" defaultCollapsed unverified>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || !noise.enabled || n < 1 || n > MAX_DECOHERENCE_QUBITS) return null;
    return decoherenceByDepth(circuit, paramValues, customGates, noise);
  }, [collapsed, circuit, paramValues, customGates, noise, n]);

  if (n === 0) return <div className="panel__placeholder">place some gates to watch them decohere</div>;
  if (n > MAX_DECOHERENCE_QUBITS) {
    return <div className="panel__notice">{n} qubits — the decoherence movie is capped at {MAX_DECOHERENCE_QUBITS} (2ⁿ bars).</div>;
  }
  if (!noise.enabled) {
    return <div className="panel__notice">Enable the noise model (Noise panel) to watch decoherence accumulate with circuit depth.</div>;
  }
  if (!result || result.dists.length === 0) return null;

  return <Movie result={result} />;
}

const W = 300;
const H = 120;
const PAD_T = 6;
const PAD_B = 14;

function Movie({ result }: { result: DecoherenceByDepth }) {
  const frames = result.dists.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Keep the frame index valid as the circuit changes underneath us.
  useEffect(() => { setStep((s) => (s >= frames ? 0 : s)); }, [frames]);

  useEffect(() => {
    if (!playing || frames <= 1) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % frames), 700);
    return () => window.clearInterval(id);
  }, [playing, frames]);

  const idx = Math.min(step, frames - 1);
  const dist = result.dists[idx];
  const n = result.numQubits;
  const dim = 1 << n;
  const uniform = 1 / dim;

  // Stable y-scale across all frames so the bars visibly *fall* toward the
  // uniform line rather than the axis rescaling every frame.
  const yMax = useMemo(
    () => Math.max(uniform * 1.05, ...result.dists.map((d) => Math.max(...d))),
    [result, uniform],
  );

  const plotH = H - PAD_T - PAD_B;
  const bw = (W - 2) / dim;
  const yUniform = PAD_T + plotH - (uniform / yMax) * plotH;
  const lastCol = result.columns[frames - 1];

  return (
    <div className="decoh">
      <div className="decoh__bar">
        <button className="decoh__play" onClick={() => setPlaying((p) => !p)} title={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={frames - 1}
          value={idx}
          onChange={(e) => { setPlaying(false); setStep(parseInt(e.target.value, 10)); }}
          className="decoh__scrub"
          title="Scrub through circuit depth"
        />
        <span className="decoh__col">col {result.columns[idx]} / {lastCol}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="decoh__svg plot-fill" role="img">
        {/* probability bars at the current depth */}
        {dist.map((p, i) => {
          const h = (Math.min(p, yMax) / yMax) * plotH;
          return (
            <rect
              key={i}
              x={1 + i * bw}
              y={PAD_T + plotH - h}
              width={Math.max(0.6, bw - 0.6)}
              height={h}
              className="decoh__prob"
            >
              <title>|{i.toString(2).padStart(n, "0")}⟩: {(p * 100).toFixed(1)}%</title>
            </rect>
          );
        })}
        {/* maximally-mixed reference */}
        <line x1={0} y1={yUniform} x2={W} y2={yUniform} className="decoh__uniform" />
        <line x1={0} y1={PAD_T + plotH} x2={W} y2={PAD_T + plotH} className="decoh__axis" />
      </svg>

      <div className="decoh__legend">
        <span><span className="decoh__swatch" /> P(outcome)</span>
        <span className="decoh__uniform-key">uniform = 1/2ⁿ</span>
        <span className="decoh__hint">
          {result.truncated ? `first ${frames} columns · ` : ""}noise accumulates with depth → drift to uniform
        </span>
      </div>
    </div>
  );
}
