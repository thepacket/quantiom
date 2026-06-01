/**
 * Shared 3D-to-2D projection for the Bloch panel (and any future sphere viz).
 *
 * Coordinate convention: +x is right, +y is into-the-screen, +z is up.
 * Simple axonometric view (roughly 30° tilt) — no perspective.
 */

export type Projected = { sx: number; sy: number; depth: number };

const TILT_X = 0.6 * Math.cos(Math.PI / 6); // ~0.52
const TILT_Y = 0.6 * Math.sin(Math.PI / 6); // ~0.30

export function project(x: number, y: number, z: number, r: number, cx: number, cy: number): Projected {
  const sx = cx + (x - TILT_X * y) * r;
  const sy = cy + (-z - TILT_Y * y) * r;
  return { sx, sy, depth: -y };
}
