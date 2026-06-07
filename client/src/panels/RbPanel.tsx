import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import {
  randomizedBenchmarking,
  interleavedRb,
  unitarityRb,
  INTERLEAVED_GATES,
  type RbResult,
  type InterleavedRbResult,
  type UnitarityResult,
} from "../sim/randomizedBenchmarking";
import type { NoiseModel } from "../sim/noise";

type Props = { noise: NoiseModel };
type Mode = "standard" | "interleaved" | "unitarity";

/**
 * Single-qubit randomized benchmarking, three modes:
 *  • Standard — survival decay P(m)=A·p^m+½, error per Clifford r=(1−p)/2.
 *  • Interleaved — isolates one Clifford gate's error r_G=(1−p_int/p_ref)/2.
 *  • Unitarity — purity decay Tr(ρ²)→1/d, fits the error coherence u.
 * All SPAM-robust; all run on click; need a non-zero 1-qubit noise rate.
 * Default-collapsed.
 */
export function RbPanel({ noise }: Props) {
  return (
    <PanelShell id="randomized-benchmarking" title="Randomized benchmarking" defaultCollapsed>
      <Body noise={noise} />
    </PanelShell>
  );
}

function Body({ noise }: Props) {
  const collapsed = usePanelCollapsed();
  const [mode, setMode] = useState<Mode>("standard");
  const [gateId, setGateId] = useState<string>("h");
  const [std, setStd] = useState<RbResult | null>(null);
  const [ilrb, setIlrb] = useState<InterleavedRbResult | null>(null);
  const [unit, setUnit] = useState<UnitarityResult | null>(null);
  const [running, setRunning] = useState(false);

  if (collapsed) return null;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      try {
        if (mode === "standard") setStd(randomizedBenchmarking(noise));
        else if (mode === "interleaved") setIlrb(interleavedRb(noise, gateId));
        else setUnit(unitarityRb(noise));
      } finally { setRunning(false); }
    }, 10);
  };

  return (
    <div className="rb">
      <div className="rb__head">
        <select className="rb__mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="standard">Standard</option>
          <option value="interleaved">Interleaved</option>
          <option value="unitarity">Unitarity</option>
        </select>
        {mode === "interleaved" && (
          <select className="rb__mode" value={gateId} onChange={(e) => setGateId(e.target.value)}>
            {INTERLEAVED_GATES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <button className="rb__run" onClick={run} disabled={running}>{running ? "running…" : "Run"}</button>
        <span className="rb__note">1q · {noise.trajectories} shots/seq</span>
      </div>
      {mode === "standard" && (std ? <Plot r={std} /> : <Hint text="Runs random Clifford sequences and fits the survival decay. Set a 1-qubit depolarising / damping rate in the Noise panel first." />)}
      {mode === "interleaved" && (ilrb ? <InterleavedPlot r={ilrb} /> : <Hint text="Runs a reference sweep and an interleaved sweep with the selected Clifford after every random one; the ratio isolates that gate's error." />)}
      {mode === "unitarity" && (unit ? <UnitarityPlot r={unit} /> : <Hint text="Runs random Clifford sequences (no recovery) and fits the purity decay Tr(ρ²)→1/d. u near 1 means coherent (calibration) error; u≈p² means stochastic." />)}
    </div>
  );
}

function Hint({ text }: { text: string }) { return <div className="rb__hint">{text}</div>; }

const W = 300, H = 150, PAD_L = 30, PAD_R = 8, PAD_T = 10, PAD_B = 22;

/** Shared decay-plot frame: axes, optional asymptote, fit curve, data dots. */
function DecayPlot({ lengths, ys, fit, asymptote, dotColor, fitColor }: {
  lengths: number[]; ys: number[]; fit: (m: number) => number; asymptote?: number;
  dotColor?: string; fitColor?: string;
}) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const mMax = lengths[lengths.length - 1] || 1;
  const xOf = (m: number) => PAD_L + (m / mMax) * plotW;
  const yOf = (v: number) => PAD_T + (1 - v) * plotH;
  const samples = 60;
  const fitPath = Array.from({ length: samples + 1 }, (_, i) => {
    const m = (mMax * i) / samples;
    return `${xOf(m).toFixed(1)},${yOf(Math.max(0, Math.min(1, fit(m)))).toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rb__svg plot-fill" role="img">
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="rb__axis-line" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="rb__axis-line" />
      {asymptote !== undefined && <line x1={PAD_L} y1={yOf(asymptote)} x2={W - PAD_R} y2={yOf(asymptote)} className="rb__asymptote" />}
      <polyline points={fitPath} className="rb__fit" style={fitColor ? { stroke: fitColor } : undefined} />
      {lengths.map((m, i) => (
        <circle key={i} cx={xOf(m)} cy={yOf(Math.max(0, Math.min(1, ys[i])))} r={2.4} className="rb__dot" style={dotColor ? { fill: dotColor } : undefined}>
          <title>m={m}: {ys[i].toFixed(3)}</title>
        </circle>
      ))}
      <text x={PAD_L - 4} y={PAD_T + 4} textAnchor="end" className="rb__axis">1</text>
      <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" className="rb__axis">0</text>
      {asymptote !== undefined && <text x={PAD_L + 2} y={yOf(asymptote) - 2} className="rb__axis">{asymptote === 0.5 ? "½" : asymptote.toFixed(2)}</text>}
      <text x={(PAD_L + W - PAD_R) / 2} y={H - 5} textAnchor="middle" className="rb__axis">sequence length m →</text>
    </svg>
  );
}

function Plot({ r }: { r: RbResult }) {
  return (
    <div className="rb__out">
      <div className="rb__stats">
        <span>p = <b>{r.p.toFixed(4)}</b></span>
        <span>EPC = <b>{(r.epc * 100).toFixed(3)}%</b></span>
        <span>{r.sequences} seq/len</span>
      </div>
      <DecayPlot lengths={r.lengths} ys={r.survival} fit={(m) => r.A * Math.pow(r.p, m) + r.B} asymptote={r.B} />
      <div className="rb__legend">survival P(|0⟩) = A·p^m + ½ · EPC = (1−p)/2 (SPAM-robust gate error)</div>
    </div>
  );
}

function InterleavedPlot({ r }: { r: InterleavedRbResult }) {
  const { reference: ref, interleaved: il } = r;
  return (
    <div className="rb__out">
      <div className="rb__stats">
        <span>p_ref = <b>{ref.p.toFixed(4)}</b></span>
        <span>p_int = <b>{r.pInterleaved.toFixed(4)}</b></span>
        <span>r(<b>{r.gateId}</b>) = <b>{(r.gateError * 100).toFixed(3)}%</b> ± {(r.bound * 100).toFixed(2)}%</span>
      </div>
      <div className="rb__dual">
        <DecayPlot lengths={ref.lengths} ys={ref.survival} fit={(m) => ref.A * Math.pow(ref.p, m) + ref.B} asymptote={0.5} dotColor="#6fb1ff" fitColor="#6fb1ff" />
        <DecayPlot lengths={il.lengths} ys={il.survival} fit={(m) => il.A * Math.pow(il.p, m) + il.B} asymptote={0.5} dotColor="#ff8e6f" fitColor="#ff8e6f" />
      </div>
      <div className="rb__legend">
        <span className="rb__key" style={{ color: "#6fb1ff" }}>reference</span>
        <span className="rb__key" style={{ color: "#ff8e6f" }}>interleaved {r.gateId}</span>
        — gate error r = (1 − p_int/p_ref)/2
      </div>
    </div>
  );
}

function UnitarityPlot({ r }: { r: UnitarityResult }) {
  // (purity − ½) normalised so the curve sits in [0,1] for the shared frame.
  const A0 = Math.max(r.A, 1e-6);
  return (
    <div className="rb__out">
      <div className="rb__stats">
        <span>u = <b>{r.u.toFixed(4)}</b></span>
        <span>{r.sequences} seq/len</span>
      </div>
      <DecayPlot
        lengths={r.lengths}
        ys={r.purity.map((q) => (q - 0.5) / A0)}
        fit={(m) => Math.pow(r.u, Math.max(0, m - 1))}
        asymptote={0}
        dotColor="#9d7bff"
        fitColor="#9d7bff"
      />
      <div className="rb__legend">normalised purity (Tr(ρ²)−½)/A = u^(m−1) · u→1 coherent error, u→p² stochastic</div>
    </div>
  );
}
