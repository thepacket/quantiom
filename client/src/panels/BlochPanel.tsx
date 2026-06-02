import type { BlochVector } from "../api";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { project } from "./sphere";
import { PanelShell } from "./PanelShell";

type Props = {
  state: SimState;
  /** Optional GPU-computed Bloch vectors from the WebGPU trajectory path.
   *  Override the CPU result when present (avoids a second pass on the same
   *  trajectories). Same big-endian qubit indexing as the CPU panel. */
  gpuBlochVectors?: { x: number; y: number; z: number }[] | null;
};

const SIZE = 110;
const R = 42;

export function BlochPanel({ state, gpuBlochVectors }: Props) {
  const data = dataOf(state);
  const blochs: BlochVector[] | null = gpuBlochVectors && data && gpuBlochVectors.length === data.blochVectors.length
    ? gpuBlochVectors
    : data?.blochVectors ?? null;
  const source: "gpu" | "cpu" = gpuBlochVectors && data && gpuBlochVectors.length === data.blochVectors.length
    ? "gpu" : "cpu";

  const copy = () => {
    if (!blochs) return "";
    return blochs
      .map((b, i) => `q${i}: (${b.x.toFixed(4)}, ${b.y.toFixed(4)}, ${b.z.toFixed(4)})`)
      .join("\n");
  };

  return (
    <PanelShell id="bloch" title="Bloch spheres" getCopyText={copy}>
      {!blochs ? (
        <div className="panel__placeholder">building circuit…</div>
      ) : (
        <>
          <div className="bloch__grid">
            {blochs.map((b, i) => (
              <BlochSphere key={i} qubit={i} v={b} />
            ))}
          </div>
          {source === "gpu" && (
            <div className="prob__note">WebGPU trajectory-averaged Bloch vectors</div>
          )}
        </>
      )}
    </PanelShell>
  );
}

function BlochSphere({ qubit, v }: { qubit: number; v: BlochVector }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const pxp = project(1, 0, 0, R, cx, cy);
  const pxn = project(-1, 0, 0, R, cx, cy);
  const pyp = project(0, 1, 0, R, cx, cy);
  const pyn = project(0, -1, 0, R, cx, cy);
  const pzp = project(0, 0, 1, R, cx, cy);
  const pzn = project(0, 0, -1, R, cx, cy);

  const tip = project(v.x, v.y, v.z, R, cx, cy);
  const magnitude = Math.hypot(v.x, v.y, v.z);

  return (
    <div className="bloch__cell">
      <svg width={SIZE} height={SIZE} className="bloch__svg">
        <circle cx={cx} cy={cy} r={R} className="bloch__outline" />
        <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.3} className="bloch__equator" />
        <line x1={pxn.sx} y1={pxn.sy} x2={pxp.sx} y2={pxp.sy} className="bloch__axis" />
        <line x1={pyn.sx} y1={pyn.sy} x2={pyp.sx} y2={pyp.sy} className="bloch__axis" />
        <line x1={pzn.sx} y1={pzn.sy} x2={pzp.sx} y2={pzp.sy} className="bloch__axis" />
        <text x={pzp.sx} y={pzp.sy - 4} className="bloch__label" textAnchor="middle">|0⟩</text>
        <text x={pzn.sx} y={pzn.sy + 10} className="bloch__label" textAnchor="middle">|1⟩</text>
        <text x={pxp.sx + 6} y={pxp.sy + 3} className="bloch__label">|+⟩</text>
        <text x={pxn.sx - 6} y={pxn.sy + 3} className="bloch__label" textAnchor="end">|−⟩</text>
        <text x={pyp.sx + 4} y={pyp.sy - 2} className="bloch__label bloch__label--y">|i⟩</text>
        <text x={pyn.sx - 4} y={pyn.sy + 8} className="bloch__label bloch__label--y" textAnchor="end">|−i⟩</text>
        {magnitude > 1e-6 && (
          <g>
            <line x1={cx} y1={cy} x2={tip.sx} y2={tip.sy} className="bloch__vector" />
            <circle cx={tip.sx} cy={tip.sy} r={3.5} className="bloch__tip" />
          </g>
        )}
      </svg>
      <div className="bloch__meta">
        <div className="bloch__qubit">q{qubit}</div>
        <div className="bloch__purity">|r|={magnitude.toFixed(3)}</div>
      </div>
    </div>
  );
}
