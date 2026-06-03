import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { project } from "./sphere";
import { qSphere, type QSpherePoint } from "../sim/qsphere";

type Props = { state: SimState };

const MAX_QUBITS = 6;

/**
 * Q-sphere — the whole multi-qubit state on one sphere. Each basis state
 * is a point: latitude = Hamming weight (|0…0⟩ at top, |1…1⟩ at bottom),
 * marker size = |amplitude|, hue = phase. Reads magnitudes and relative
 * phases together: GHZ = two big antipodal dots a half-turn apart in
 * phase, W = a ring of equal dots at weight 1, QFT = a phase gradient
 * around each ring.
 *
 * Statevector path only, capped at 6 qubits (64 points), default-collapsed.
 */
export function QSpherePanel({ state }: Props) {
  return (
    <PanelShell id="qsphere" title="Q-sphere" defaultCollapsed>
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
    return qSphere(data.amplitudes, n, MAX_QUBITS);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no statevector amplitudes for the Q-sphere.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — amplitudes from a single trajectory aren't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the Q-sphere is capped at {MAX_QUBITS} (64 states).</div>;
  if (!result) return null;

  return <Sphere points={result.points} />;
}

const SIZE = 200;
const R = 78;

function hueFor(phase: number): string {
  const deg = ((phase + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${deg.toFixed(0)}, 75%, 58%)`;
}

function Sphere({ points }: { points: QSpherePoint[] }) {
  const cx = SIZE / 2, cy = SIZE / 2;
  const eqTop = project(0, 0, 1, R, cx, cy);
  const eqBot = project(0, 0, -1, R, cx, cy);
  // Sort by depth so far points draw first.
  const drawn = [...points].map((p) => ({ p, pr: project(p.x, p.y, p.z, R, cx, cy) }))
    .sort((a, b) => a.pr.depth - b.pr.depth);

  return (
    <div className="qsphere">
      <svg width={SIZE} height={SIZE} className="qsphere__svg" role="img">
        <circle cx={cx} cy={cy} r={R} className="qsphere__outline" />
        <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.3} className="qsphere__equator" />
        <line x1={eqTop.sx} y1={eqTop.sy} x2={eqBot.sx} y2={eqBot.sy} className="qsphere__axis" />
        {drawn.map(({ p, pr }) => {
          if (p.mag < 1e-4) return null;
          const r = 2 + p.mag * 8;
          return (
            <g key={p.index}>
              <line x1={cx} y1={cy} x2={pr.sx} y2={pr.sy} className="qsphere__stem" />
              <circle cx={pr.sx} cy={pr.sy} r={r} fill={hueFor(p.phase)} className="qsphere__dot">
                <title>|{p.basis}⟩ (weight {p.weight}): |amp|={p.mag.toFixed(4)}, phase={(p.phase * 180 / Math.PI).toFixed(0)}°</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="qsphere__legend">
        <span>top = |0…0⟩ · bottom = |1…1⟩ · size = |amp|</span>
        <span className="ampphase__hue" />
        <span>phase −π … +π</span>
      </div>
    </div>
  );
}
