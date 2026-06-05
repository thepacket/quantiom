import { useEffect, useMemo, useRef, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { qSphere, type QSpherePoint } from "../sim/qsphere";
import { useEndianness, displayAmplitudes } from "./endianness";

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
 * The view is an orbitable 3-D globe: drag to rotate in any direction,
 * scroll to zoom, double-click to reset. A latitude ring is drawn at each
 * Hamming-weight level (echoing the |x⟩ → latitude mapping) plus meridians
 * for orientation.
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
  const { endian } = useEndianness();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data) return null;
    if (data.isStabilizer || data.isNoisy) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    return qSphere(displayAmplitudes(data.amplitudes, n, endian), n, MAX_QUBITS);
  }, [collapsed, data, n, endian]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — no statevector amplitudes for the Q-sphere.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — amplitudes from a single trajectory aren't meaningful.</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the Q-sphere is capped at {MAX_QUBITS} (64 states).</div>;
  if (!result) return null;

  return <Sphere points={result.points} n={n} />;
}

const SIZE = 248;
const R0 = 96;
const DEFAULT_VIEW = { az: 0.5, el: -0.35, zoom: 1 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hueFor(phase: number): string {
  const deg = ((phase + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${deg.toFixed(0)}, 75%, 58%)`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Format a phase (rad) as a multiple of π in [0, 2π) — e.g. "0", "π/2",
 *  "3π/4", "2π" — falling back to "k.kkπ" when it isn't a tidy fraction. */
function fmtPhase(phase: number): string {
  let a = phase;
  while (a < -1e-9) a += 2 * Math.PI;
  while (a >= 2 * Math.PI - 1e-9) a -= 2 * Math.PI;
  const r = a / Math.PI; // [0, 2)
  if (Math.abs(r) < 2e-3) return "0";
  for (const d of [1, 2, 3, 4, 6]) {
    const k = Math.round(r * d);
    if (k !== 0 && Math.abs(r - k / d) < 0.02) {
      const g = gcd(k, d), nn = k / g, dd = d / g;
      const piStr = nn === 1 ? "π" : `${nn}π`;
      return dd === 1 ? piStr : `${piStr}/${dd}`;
    }
  }
  return `${r.toFixed(2)}π`;
}

type View = { az: number; el: number; zoom: number };

/** Rotate a unit-sphere point by azimuth (about the vertical z-axis) then
 *  elevation (about the screen-horizontal x-axis), and orthographically
 *  project. depth grows toward the viewer (+y after rotation). */
function projector(view: View) {
  const cx = SIZE / 2, cy = SIZE / 2;
  const R = R0 * view.zoom;
  const ca = Math.cos(view.az), sa = Math.sin(view.az);
  const ce = Math.cos(view.el), se = Math.sin(view.el);
  return (x: number, y: number, z: number) => {
    const x1 = x * ca - y * sa;
    const y1 = x * sa + y * ca;
    const y2 = y1 * ce - z * se;
    const z2 = y1 * se + z * ce;
    return { sx: cx + x1 * R, sy: cy - z2 * R, depth: y2 };
  };
}

/** Probability (= |amp|²) as a clean-but-precise decimal, trimming the
 *  floating-point dust a raw toString would show. */
function fmtProb(prob: number): string {
  if (prob <= 0) return "0";
  if (prob >= 1 - 1e-12) return "1";
  return parseFloat(prob.toPrecision(6)).toString();
}

type Hover = { point: QSpherePoint; sx: number; sy: number };

function Sphere({ points, n }: { points: QSpherePoint[]; n: number }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [hover, setHover] = useState<Hover | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Wheel-zoom via a non-passive listener so we can preventDefault without a
  // console warning and without scroll-jacking the page.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: clamp(v.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.55, 2.4) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    setHover(null); // hide the tooltip while orbiting
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, az: v.az + dx * 0.012, el: clamp(v.el + dy * 0.012, -1.5, 1.5) }));
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const cx = SIZE / 2, cy = SIZE / 2;
  const proj = projector(view);

  // Latitude rings (one per Hamming-weight level) + meridians for orientation.
  const ring = (theta: number) => {
    const st = Math.sin(theta), ct = Math.cos(theta);
    const pts: string[] = [];
    for (let k = 0; k <= 48; k++) {
      const phi = (2 * Math.PI * k) / 48;
      const p = proj(st * Math.cos(phi), st * Math.sin(phi), ct);
      pts.push(`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const meridian = (phi: number) => {
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const pts: string[] = [];
    for (let k = 0; k <= 32; k++) {
      const theta = (Math.PI * k) / 32;
      const st = Math.sin(theta), ct = Math.cos(theta);
      const p = proj(st * cp, st * sp, ct);
      pts.push(`${p.sx.toFixed(1)},${p.sy.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const latitudes = useMemo(() => Array.from({ length: n - 1 }, (_, i) => ring(Math.PI * (i + 1) / n)), [view, n]);
  const meridians = useMemo(() => [0, 1, 2, 3].map((k) => meridian((k * Math.PI) / 4)), [view]);
  // The equatorial plane (z = 0 great circle) — drawn as a faint translucent
  // disk plus a crisper ring outline, echoing IBM Composer's Q-sphere.
  const equator = useMemo(() => ring(Math.PI / 2), [view]);

  const axTop = proj(0, 0, 1), axBot = proj(0, 0, -1);

  // Depth-sort dots so the ones nearest the viewer draw last (on top).
  const drawn = points
    .filter((p) => p.mag >= 1e-4)
    .map((p) => ({ p, pr: proj(p.x, p.y, p.z) }))
    .sort((a, b) => a.pr.depth - b.pr.depth);

  // Label the most significant basis states (cap to keep it readable).
  const maxMag = points.reduce((m, p) => Math.max(m, p.mag), 0);
  const labelThreshold = Math.max(0.06, 0.25 * maxMag);
  const labelled = new Set(
    [...drawn].filter(({ p }) => p.mag >= labelThreshold).sort((a, b) => b.p.mag - a.p.mag).slice(0, 12).map(({ p }) => p.index),
  );

  const onLeaveSvg = () => { if (!drag.current) setHover(null); };

  return (
    <div className="qsphere">
      <div className="qsphere__stage" style={{ width: SIZE, height: SIZE }}>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        className="qsphere__svg"
        role="img"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onLeaveSvg}
        onDoubleClick={() => setView(DEFAULT_VIEW)}
      >
        <circle cx={cx} cy={cy} r={R0 * view.zoom} className="qsphere__outline" />
        <polygon points={equator} className="qsphere__plane" />
        {latitudes.map((d, i) => <polyline key={`lat-${i}`} points={d} className="qsphere__wire" />)}
        {meridians.map((d, i) => <polyline key={`mer-${i}`} points={d} className="qsphere__wire" />)}
        <polyline points={equator} className="qsphere__equator" />
        <line x1={axTop.sx} y1={axTop.sy} x2={axBot.sx} y2={axBot.sy} className="qsphere__axis" />
        {drawn.map(({ p, pr }) => {
          const r = 2 + p.mag * 9;
          const show = labelled.has(p.index);
          const right = pr.sx >= cx;
          const hit = Math.max(r + 4, 7); // generous hover target for small dots
          return (
            <g
              key={p.index}
              onPointerEnter={() => { if (!drag.current) setHover({ point: p, sx: pr.sx, sy: pr.sy }); }}
              onPointerLeave={() => { if (!drag.current) setHover(null); }}
              style={{ cursor: "pointer" }}
            >
              <line x1={cx} y1={cy} x2={pr.sx} y2={pr.sy} className="qsphere__stem" />
              <circle cx={pr.sx} cy={pr.sy} r={r} fill={hueFor(p.phase)} className="qsphere__dot" />
              <circle cx={pr.sx} cy={pr.sy} r={hit} fill="transparent" className="qsphere__hit" />
              {show && (
                <text
                  x={pr.sx + (right ? r + 3 : -(r + 3))}
                  y={pr.sy + 3}
                  textAnchor={right ? "start" : "end"}
                  className="qsphere__label"
                >
                  |{p.basis}⟩<tspan className="qsphere__label-phase"> {fmtPhase(p.phase)}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="qsphere__tip"
          style={{
            left: hover.sx,
            top: hover.sy,
            transform: `translate(${hover.sx > cx ? "calc(-100% - 12px)" : "12px"}, -50%)`,
          }}
        >
          <div className="qsphere__tip-state">State |{hover.point.basis}⟩</div>
          <div className="qsphere__tip-row">Probability: <b>{fmtProb(hover.point.mag * hover.point.mag)}</b></div>
          <div className="qsphere__tip-row">
            Phase angle: <b>{fmtPhase(hover.point.phase)}</b>
            <span className="qsphere__tip-dot" style={{ background: hueFor(hover.point.phase) }} />
          </div>
        </div>
      )}
      </div>
      <div className="qsphere__legend">
        <span>top = |0…0⟩ · bottom = |1…1⟩ · size = |amp|</span>
        <span className="ampphase__hue" />
        <span>phase −π … +π</span>
        <span className="qsphere__hint">drag to rotate · scroll to zoom · double-click to reset</span>
      </div>
    </div>
  );
}
