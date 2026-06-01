/**
 * Shared 3D-to-2D projection for the Bloch and Q-sphere panels.
 *
 * Coordinate convention: +x is right, +y is into-the-screen, +z is up.
 * We use a simple axonometric view (roughly 30° tilt) — no perspective.
 */

export type Projected = { sx: number; sy: number; depth: number };

const TILT_X = 0.6 * Math.cos(Math.PI / 6); // ~0.52
const TILT_Y = 0.6 * Math.sin(Math.PI / 6); // ~0.30

export function project(x: number, y: number, z: number, r: number, cx: number, cy: number): Projected {
  const sx = cx + (x - TILT_X * y) * r;
  const sy = cy + (-z - TILT_Y * y) * r;
  return { sx, sy, depth: -y };
}

/**
 * HSL color from a phase angle. Returns a string usable in SVG fill/stroke.
 * 0 phase = red; π/2 = green; π = cyan; -π/2 = magenta.
 */
export function phaseColor(re: number, im: number): string {
  if (Math.hypot(re, im) < 1e-9) return "#666";
  const angle = Math.atan2(im, re); // [-π, π]
  const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${hue.toFixed(1)} 70% 60%)`;
}

/** Population count (Hamming weight). */
export function popcount(n: number): number {
  let c = 0;
  let v = n;
  while (v) {
    v &= v - 1;
    c += 1;
  }
  return c;
}

/** Binomial coefficient C(n, k). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let num = 1;
  let den = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) {
    num *= n - i + 1;
    den *= i;
  }
  return num / den;
}
