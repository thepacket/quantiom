/**
 * Arbitrary-unitary synthesis via Gray-ordered two-level (Givens)
 * decomposition.
 *
 * Any n-qubit unitary factors into two-level unitaries — 2×2 rotations acting
 * on a pair of computational basis states (Nielsen & Chuang §4.5.1). By
 * eliminating in **Gray-code order**, every two-level rotation connects basis
 * states that differ in exactly one bit, so it maps directly to a single
 * `u_arb` (2×2) gate on that qubit, controlled (with anti-controls) by the
 * other qubits fixed to the shared bit pattern. A final pass clears the
 * residual diagonal phases (the last one is a global phase, dropped).
 *
 * This is correct and general but NOT CNOT-optimal — it's the textbook
 * exponential construction, not Quantum Shannon Decomposition's optimal count.
 * Capped at 4 qubits (the gate count is O(4ⁿ)). Verified by rebuilding the
 * synthesized circuit's unitary and comparing to the input up to global phase.
 *
 * Big-endian: qubit 0 is the MSB of the basis index.
 */

import type { PlacedGate, GateId } from "../editor/types";

const MAX_QUBITS = 4;

let _uid = 0;

/** Complex number as a plain object (distinct from sim/complex's tuple form). */
export type Cx = { re: number; im: number };
type C = Cx;
const cMul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cAdd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cConj = (a: C): C => ({ re: a.re, im: -a.im });
const cAbs2 = (a: C): number => a.re * a.re + a.im * a.im;

/** A recorded two-level step: rows (p, q) of the Gray-permuted matrix and the
 *  2×2 unitary G applied to them (G·rows). */
type Step = { p: number; q: number; g: [C, C, C, C] };

export function synthesizeUnitary(U: Cx[][], n: number): PlacedGate[] | null {
  if (n < 1 || n > MAX_QUBITS) return null;
  const dim = 1 << n;
  if (U.length !== dim || U.some((r) => r.length !== dim)) return null;

  // Gray order and its inverse.
  const gray = Array.from({ length: dim }, (_, k) => k ^ (k >> 1));

  // Permuted matrix V[i][j] = U[gray[i]][gray[j]], as a mutable C[][].
  const V: C[][] = Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => ({ re: U[gray[i]][gray[j]].re, im: U[gray[i]][gray[j]].im })),
  );

  const steps: Step[] = [];
  const applyG = (p: number, q: number, g: [C, C, C, C]) => {
    // rows p,q ← G · (rows p,q)
    for (let c = 0; c < dim; c++) {
      const vp = V[p][c], vq = V[q][c];
      V[p][c] = cAdd(cMul(g[0], vp), cMul(g[1], vq));
      V[q][c] = cAdd(cMul(g[2], vp), cMul(g[3], vq));
    }
    steps.push({ p, q, g });
  };

  // ── Givens sweep: zero below-diagonal, adjacent rows only ────────
  for (let j = 0; j < dim; j++) {
    for (let q = dim - 1; q > j; q--) {
      const p = q - 1;
      const a = V[p][j], b = V[q][j];
      const r2 = cAbs2(a) + cAbs2(b);
      if (r2 < 1e-24) continue;
      const r = Math.sqrt(r2);
      // G = (1/r) [[ā, b̄], [−b, a]]  →  G·(a,b)ᵀ = (r, 0)
      const g: [C, C, C, C] = [
        { re: a.re / r, im: -a.im / r },
        { re: b.re / r, im: -b.im / r },
        { re: -b.re / r, im: -b.im / r },
        { re: a.re / r, im: a.im / r },
      ];
      applyG(p, q, g);
    }
  }

  // ── diagonal cleanup: push phases up so each V[q][q] → 1 ─────────
  for (let q = dim - 1; q >= 1; q--) {
    const d = V[q][q];
    if (Math.abs(d.re - 1) < 1e-12 && Math.abs(d.im) < 1e-12) continue;
    // multiply row q by conj(d)/|d| → diag(1, conj(d̂)) on rows (q-1, q)
    const mag = Math.sqrt(cAbs2(d)) || 1;
    const cd: C = { re: d.re / mag, im: -d.im / mag };
    applyG(q - 1, q, [{ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, cd]);
  }

  // ── emit gates: U = (P† E_1† P)(P† E_2† P)… so apply E_K† first ──
  const gates: PlacedGate[] = [];
  for (let k = steps.length - 1; k >= 0; k--) {
    const { p, q, g } = steps[k];
    const a0 = gray[p], a1 = gray[q]; // differ in one bit
    const diff = a0 ^ a1;
    const t = bitToQubit(diff, n);
    // G† in basis (a0, a1)
    const gd: [C, C, C, C] = [cConj(g[0]), cConj(g[2]), cConj(g[1]), cConj(g[3])];
    // Reorder to (low = bit t 0, high = bit t 1).
    const a0Low = ((a0 >> (n - 1 - t)) & 1) === 0;
    const m: [C, C, C, C] = a0Low ? gd : [gd[3], gd[2], gd[1], gd[0]];
    gates.push(twoLevelGate(m, a0, t, n));
  }
  // Re-pack columns.
  gates.forEach((gt, i) => (gt.column = i));
  return gates;
}

/** Map a single-bit mask to its qubit index (big-endian). */
function bitToQubit(mask: number, n: number): number {
  // mask has exactly one set bit at position b (0 = LSB). qubit = n-1-b.
  let b = 0;
  let m = mask;
  while (m > 1) { m >>= 1; b++; }
  return n - 1 - b;
}

/** A 2×2 unitary `m` (basis order low/high of qubit `t`) controlled by the
 *  other qubits fixed to the bits of `pattern`. */
function twoLevelGate(m: [C, C, C, C], pattern: number, t: number, n: number): PlacedGate {
  const controls: number[] = [];
  const controlStates: boolean[] = [];
  for (let qq = 0; qq < n; qq++) {
    if (qq === t) continue;
    controls.push(qq);
    controlStates.push(((pattern >> (n - 1 - qq)) & 1) === 1);
  }
  const params = [m[0].re, m[0].im, m[1].re, m[1].im, m[2].re, m[2].im, m[3].re, m[3].im].map((v) =>
    String(cleanZero(v)),
  );
  return {
    id: `us${_uid++}`,
    gateId: "u_arb" as GateId,
    column: 0,
    controls,
    targets: [t],
    clbits: [],
    params,
    controlStates: controls.length ? controlStates : undefined,
  };
}

function cleanZero(v: number): number {
  return Math.abs(v) < 1e-12 ? 0 : v;
}
