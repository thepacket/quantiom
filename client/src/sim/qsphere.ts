/**
 * Q-sphere layout. Every computational basis state |x⟩ is a point on a
 * single sphere: its latitude is set by Hamming weight (|0…0⟩ at the north
 * pole, |1…1⟩ at the south pole, weight-k states on the k-th latitude
 * ring), longitudes spread evenly around each ring. The marker's size is
 * the amplitude magnitude |⟨x|ψ⟩| and its hue is the phase arg⟨x|ψ⟩.
 *
 * It packs the whole multi-qubit state — magnitudes *and* relative phases —
 * into one picture: GHZ shows two big antipodal dots a half-turn apart in
 * phase, a W state shows a ring of equal dots at weight 1, QFT shows a
 * phase gradient around each ring.
 */

import type { Amplitude } from "./simulate";

export type QSpherePoint = {
  basis: string;
  index: number;
  weight: number;
  mag: number;
  phase: number;
  /** Unit-sphere coordinates (north pole = +z). */
  x: number;
  y: number;
  z: number;
};

export type QSphereResult = {
  points: QSpherePoint[];
  numQubits: number;
};

function popcount(x: number): number {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

export function qSphere(
  amplitudes: Amplitude[],
  n: number,
  maxQubits = 6,
): QSphereResult | null {
  if (n < 1 || n > maxQubits) return null;

  // Bucket basis indices by Hamming weight, preserving index order.
  const byWeight: number[][] = Array.from({ length: n + 1 }, () => []);
  for (const a of amplitudes) byWeight[popcount(a.index)].push(a.index);

  const ampByIndex = new Map<number, Amplitude>();
  for (const a of amplitudes) ampByIndex.set(a.index, a);

  const points: QSpherePoint[] = [];
  for (let w = 0; w <= n; w++) {
    const ring = byWeight[w];
    const count = ring.length;
    const theta = (Math.PI * w) / n; // 0 = north pole (|0…0⟩)
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let j = 0; j < count; j++) {
      const idx = ring[j];
      const a = ampByIndex.get(idx)!;
      // Single state on a ring (poles) sits on the axis; otherwise spread.
      const phi = count > 1 ? (2 * Math.PI * j) / count : 0;
      points.push({
        basis: a.basis,
        index: idx,
        weight: w,
        mag: Math.hypot(a.re, a.im),
        phase: Math.atan2(a.im, a.re),
        x: sinT * Math.cos(phi),
        y: sinT * Math.sin(phi),
        z: cosT,
      });
    }
  }
  return { points, numQubits: n };
}
