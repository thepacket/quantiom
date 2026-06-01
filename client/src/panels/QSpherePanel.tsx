import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { phaseColor, popcount, project } from "./sphere";
import { PanelShell } from "./PanelShell";

type Props = { state: SimState };

const SIZE = 200;
const R = 78;

export function QSpherePanel({ state }: Props) {
  const data = dataOf(state);

  const markers = useMemo(() => {
    if (!data) return [];
    const n = data.numQubits;
    const byWeight: number[][] = Array.from({ length: n + 1 }, () => []);
    for (let i = 0; i < 1 << n; i++) byWeight[popcount(i)].push(i);

    const out: Array<{
      idx: number;
      mag: number;
      re: number;
      im: number;
      x: number;
      y: number;
      z: number;
    }> = [];
    for (let w = 0; w <= n; w++) {
      const ring = byWeight[w];
      const theta = (Math.PI * w) / n;
      const m = ring.length;
      for (let k = 0; k < m; k++) {
        const idx = ring[k];
        const phi = m === 1 ? 0 : (2 * Math.PI * k) / m;
        const a = data.amplitudes[idx];
        const re = a.re ?? 0;
        const im = a.im ?? 0;
        const mag = Math.hypot(re, im);
        out.push({
          idx,
          mag,
          re,
          im,
          x: Math.sin(theta) * Math.cos(phi),
          y: Math.sin(theta) * Math.sin(phi),
          z: Math.cos(theta),
        });
      }
    }
    return out;
  }, [data]);

  return (
    <PanelShell id="qsphere" title="Q-sphere">
      {!data ? (
        <div className="panel__placeholder">building circuit…</div>
      ) : data.amplitudes.some((a) => a.re === null) ? (
        <div className="panel__placeholder">set symbolic parameters to view Q-sphere</div>
      ) : (
        <QSphereSvg data={data} markers={markers} />
      )}
    </PanelShell>
  );
}

function QSphereSvg({
  data,
  markers,
}: {
  data: NonNullable<ReturnType<typeof dataOf>>;
  markers: Array<{
    idx: number; mag: number; re: number; im: number; x: number; y: number; z: number;
  }>;
}) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  return (
    <>
      <svg width={SIZE} height={SIZE} className="qsphere__svg">
        <circle cx={cx} cy={cy} r={R} className="qsphere__outline" />
        <ellipse cx={cx} cy={cy} rx={R} ry={R * 0.3} className="qsphere__equator" />
        <ellipse cx={cx} cy={cy} rx={R * 0.3} ry={R} className="qsphere__equator" />
        <text x={cx} y={cy - R - 4} className="qsphere__pole" textAnchor="middle">
          |{"0".repeat(data.numQubits)}⟩
        </text>
        <text x={cx} y={cy + R + 12} className="qsphere__pole" textAnchor="middle">
          |{"1".repeat(data.numQubits)}⟩
        </text>
        {[...markers]
          .sort((a, b) => b.y - a.y)
          .map((m) => {
            const p = project(m.x, m.y, m.z, R, cx, cy);
            if (m.mag < 1e-6) {
              return <circle key={m.idx} cx={p.sx} cy={p.sy} r={1.5} className="qsphere__zero" />;
            }
            const radius = 3 + 18 * m.mag * m.mag;
            const color = phaseColor(m.re, m.im);
            // Phase tick: short outward line from marker, rotated by arg(amp).
            const phase = Math.atan2(m.im, m.re);
            const tickLen = radius + 8;
            const tickX = p.sx + Math.cos(phase) * tickLen;
            const tickY = p.sy - Math.sin(phase) * tickLen;
            return (
              <g key={m.idx}>
                <line x1={cx} y1={cy} x2={p.sx} y2={p.sy} className="qsphere__spoke" />
                <line x1={p.sx} y1={p.sy} x2={tickX} y2={tickY} className="qsphere__phase-tick" stroke={color} />
                <circle cx={p.sx} cy={p.sy} r={radius} fill={color} className="qsphere__marker">
                  <title>
                    |{m.idx.toString(2).padStart(data.numQubits, "0")}⟩ {" "}
                    |amp|² = {(m.mag * m.mag).toFixed(4)} {" "}
                    arg = {(phase * (180 / Math.PI)).toFixed(1)}°
                  </title>
                </circle>
              </g>
            );
          })}
      </svg>
      <PhaseLegend />
    </>
  );
}

function PhaseLegend() {
  const stops: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const angle = -Math.PI + (i / 12) * 2 * Math.PI;
    stops.push(`hsl(${(((angle + Math.PI) / (2 * Math.PI)) * 360).toFixed(1)} 70% 60%) ${(i / 12) * 100}%`);
  }
  const grad = `linear-gradient(90deg, ${stops.join(", ")})`;
  return (
    <div className="qsphere__legend">
      <span>−π</span>
      <div className="qsphere__legend-bar" style={{ background: grad }} />
      <span>+π</span>
      <span className="qsphere__legend-label">phase</span>
    </div>
  );
}
