import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";

type Props = { state: SimState };

const SIZE = 80;
const R = 30;

/**
 * Phase disk per qubit. Each disk shows the off-diagonal ρ_q[0,1] in the
 * complex plane: angle = arg, magnitude = |ρ_q[0,1]| ∈ [0, ½]. A pure |+⟩
 * gives a needle along +X with length 0.5; a pure |0⟩ or |1⟩ gives an
 * empty disk; a pure |+i⟩ gives a needle along +Y. Complements the Bloch
 * panel: where Bloch shows X/Y/Z components together in 3D, the phase
 * disk isolates the X-Y plane (the "phase information") cleanly.
 *
 * Cheap: derived from the same Bloch vectors already computed by the
 * simulator. Default-collapsed so it's free until opened.
 */
export function PhaseDiskPanel({ state }: Props) {
  return (
    <PanelShell id="phase-disk" title="Phase disks" defaultCollapsed>
      <PhaseDiskBody state={state} />
    </PanelShell>
  );
}

function PhaseDiskBody({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);

  const disks = useMemo(() => {
    if (collapsed || !data) return null;
    // ρ_q[0,1] complex = (r_x + i r_y) / 2 where r is the qubit's Bloch vector.
    return data.blochVectors.map((b) => {
      const re = b.x / 2;
      const im = b.y / 2;
      const mag = Math.hypot(re, im); // 0..0.5
      const angle = Math.atan2(im, re); // -π..π
      return { re, im, mag, angle };
    });
  }, [data, collapsed]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (data.isStabilizer) {
    return (
      <div className="panel__notice">
        Clifford fast path — phase disks reduce to the X-Y projection of the
        per-qubit Bloch vector; that view is already in the Bloch panel.
      </div>
    );
  }
  if (!disks) return null;
  return (
    <div className="phase-disk__grid">
      {disks.map((d, i) => (
        <Disk key={i} qubit={i} re={d.re} im={d.im} mag={d.mag} angle={d.angle} />
      ))}
    </div>
  );
}

function Disk({ qubit, re, im, mag, angle }: { qubit: number; re: number; im: number; mag: number; angle: number }) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  // Scale magnitude (0..0.5) to disk radius.
  const tipR = (mag / 0.5) * R;
  const tipX = cx + tipR * Math.cos(angle);
  const tipY = cy - tipR * Math.sin(angle); // SVG y is flipped
  return (
    <div className="phase-disk__cell">
      <svg width={SIZE} height={SIZE} className="phase-disk__svg">
        <circle cx={cx} cy={cy} r={R} className="phase-disk__outline" />
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} className="phase-disk__axis" />
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} className="phase-disk__axis" />
        <text x={cx + R + 2} y={cy + 3} className="phase-disk__label">Re</text>
        <text x={cx - 3} y={cy - R - 2} className="phase-disk__label" textAnchor="end">Im</text>
        {mag > 1e-6 && (
          <g>
            <line x1={cx} y1={cy} x2={tipX} y2={tipY} className="phase-disk__needle" />
            <circle cx={tipX} cy={tipY} r={2.5} className="phase-disk__tip" />
          </g>
        )}
      </svg>
      <div className="phase-disk__meta">
        <div>q{qubit}</div>
        <div className="phase-disk__hint" title={`ρ[0,1] = ${re.toFixed(3)} ${im >= 0 ? "+" : "−"} ${Math.abs(im).toFixed(3)}i`}>
          |ρ₀₁|={mag.toFixed(3)} · arg={(angle * 180 / Math.PI).toFixed(0)}°
        </div>
      </div>
    </div>
  );
}
