/**
 * Aaronson–Gottesman stabilizer (tableau) simulator.
 *
 * Tracks an n-qubit pure stabilizer state in O(n²) memory and O(n) per
 * Clifford gate, scaling to thousands of qubits where the statevector
 * sim would need petabytes. Routes are auto-selected in `simulate.ts`:
 * Clifford-only circuits on > 16 qubits flow through here; everything
 * else stays on the Float64Array path.
 *
 * Tableau layout (Uint8Array of size 2n · (2n+1)):
 *   • rows 0..n-1: destabilizer generators d_0..d_{n-1}
 *   • rows n..2n-1: stabilizer generators s_0..s_{n-1}
 *   • cols 0..n-1: X-part (binary)
 *   • cols n..2n-1: Z-part (binary)
 *   • col 2n: phase r (0 = +1, 1 = -1)
 *
 * A Pauli on qubit q is encoded as (x_q, z_q): (1,0)=X, (0,1)=Z, (1,1)=Y,
 * (0,0)=I. We currently use only the stabilizer half — destabilizers are
 * kept so a future measurement panel can do O(n²) projection.
 *
 * Reference: S. Aaronson, D. Gottesman, "Improved Simulation of Stabilizer
 * Circuits", arXiv:quant-ph/0406196. The H/S/CX rules below follow §4 of
 * that paper verbatim.
 */

export class Stabilizer {
  readonly n: number;
  private readonly stride: number;
  private readonly tab: Uint8Array;

  constructor(n: number) {
    this.n = n;
    this.stride = 2 * n + 1;
    this.tab = new Uint8Array(2 * n * this.stride);
    // |0…0⟩ initial state: d_i = X_i, s_i = Z_i, all phases 0.
    for (let i = 0; i < n; i++) {
      this.set(i, i, 1);             // destabilizer i has X on qubit i
      this.set(n + i, n + i, 1);     // stabilizer i has Z on qubit i
    }
  }

  // ─── Cell accessors ──────────────────────────────────────────────────

  private idx(row: number, col: number): number {
    return row * this.stride + col;
  }
  private get(row: number, col: number): number {
    return this.tab[this.idx(row, col)];
  }
  private set(row: number, col: number, value: number): void {
    this.tab[this.idx(row, col)] = value & 1;
  }
  /** Phase bit for row (0/1). */
  private r(row: number): number {
    return this.tab[this.idx(row, 2 * this.n)];
  }
  private setR(row: number, v: number): void {
    this.tab[this.idx(row, 2 * this.n)] = v & 1;
  }

  // ─── Clifford gates ──────────────────────────────────────────────────

  /** Hadamard on qubit a. */
  h(a: number): void {
    const n = this.n;
    const xCol = a;
    const zCol = n + a;
    for (let i = 0; i < 2 * n; i++) {
      const xi = this.get(i, xCol);
      const zi = this.get(i, zCol);
      this.setR(i, this.r(i) ^ (xi & zi));
      this.set(i, xCol, zi);
      this.set(i, zCol, xi);
    }
  }

  /** S on qubit a. */
  s(a: number): void {
    const n = this.n;
    const xCol = a;
    const zCol = n + a;
    for (let i = 0; i < 2 * n; i++) {
      const xi = this.get(i, xCol);
      const zi = this.get(i, zCol);
      this.setR(i, this.r(i) ^ (xi & zi));
      this.set(i, zCol, zi ^ xi);
    }
  }

  /** S† = S³. */
  sdg(a: number): void {
    this.s(a);
    this.s(a);
    this.s(a);
  }

  /** CNOT with control a, target b. */
  cnot(a: number, b: number): void {
    const n = this.n;
    const xA = a;
    const xB = b;
    const zA = n + a;
    const zB = n + b;
    for (let i = 0; i < 2 * n; i++) {
      const x_ia = this.get(i, xA);
      const x_ib = this.get(i, xB);
      const z_ia = this.get(i, zA);
      const z_ib = this.get(i, zB);
      this.setR(i, this.r(i) ^ (x_ia & z_ib & (x_ib ^ z_ia ^ 1)));
      this.set(i, xB, x_ib ^ x_ia);
      this.set(i, zA, z_ia ^ z_ib);
    }
  }

  /** Pauli-X: anticommutes with Z → flip phase wherever z is set. */
  x(a: number): void {
    const zCol = this.n + a;
    for (let i = 0; i < 2 * this.n; i++) {
      this.setR(i, this.r(i) ^ this.get(i, zCol));
    }
  }

  /** Pauli-Z: flip phase where x is set. */
  z(a: number): void {
    const xCol = a;
    for (let i = 0; i < 2 * this.n; i++) {
      this.setR(i, this.r(i) ^ this.get(i, xCol));
    }
  }

  /** Pauli-Y: phase flips where x XOR z is set. */
  y(a: number): void {
    const n = this.n;
    for (let i = 0; i < 2 * n; i++) {
      this.setR(i, this.r(i) ^ this.get(i, a) ^ this.get(i, n + a));
    }
  }

  /** CZ via H_b CNOT_{ab} H_b. */
  cz(a: number, b: number): void {
    this.h(b);
    this.cnot(a, b);
    this.h(b);
  }

  /** CY via S†_b CNOT_{ab} S_b. */
  cy(a: number, b: number): void {
    this.sdg(b);
    this.cnot(a, b);
    this.s(b);
  }

  /** SWAP via three CNOTs. */
  swap(a: number, b: number): void {
    this.cnot(a, b);
    this.cnot(b, a);
    this.cnot(a, b);
  }

  /** √X = H S H · ω; we use the Clifford identity SX = HSH (up to a global
   *  phase that doesn't affect the stabilizer state). */
  sx(a: number): void {
    this.h(a);
    this.s(a);
    this.h(a);
  }

  sxdg(a: number): void {
    this.h(a);
    this.sdg(a);
    this.h(a);
  }

  // ─── Measurement (Aaronson-Gottesman §4.1–4.2) ─────────────────────

  /**
   * Sample a Z-basis measurement of qubit a. Returns the classical outcome
   * (0 or 1) and updates the tableau to reflect the post-measurement state.
   *
   * Two cases:
   *   • Random — at least one stabilizer anti-commutes with Z_a. We pick
   *     the first such stabilizer, multiply it into every other anti-
   *     commuting generator (so only it remains), copy it down to the
   *     destabilizer slot, then replace it with Z_a carrying a random
   *     sign. The outcome is that random bit.
   *   • Deterministic — every stabilizer commutes with Z_a; the outcome
   *     is fixed by the destabilizer rows. We compute it by accumulating
   *     a scratch Pauli over the relevant stabilizer generators and
   *     reading its sign.
   */
  measureZ(a: number, rng: () => number): number {
    const n = this.n;
    const stride = this.stride;
    // Find a stabilizer row p with x[p][a] = 1.
    let p = -1;
    for (let i = n; i < 2 * n; i++) {
      if (this.get(i, a) === 1) { p = i; break; }
    }
    if (p !== -1) {
      // Random case.
      for (let i = 0; i < 2 * n; i++) {
        if (i !== p && this.get(i, a) === 1) this.rowsum(i, p);
      }
      // Copy row p down to its destabilizer slot.
      const dest = p - n;
      for (let c = 0; c < stride; c++) {
        this.tab[dest * stride + c] = this.tab[p * stride + c];
      }
      // Replace row p with Z_a, sign = random bit.
      for (let c = 0; c < 2 * n; c++) this.tab[p * stride + c] = 0;
      this.set(p, n + a, 1);
      const outcome = rng() < 0.5 ? 0 : 1;
      this.setR(p, outcome);
      return outcome;
    }
    // Deterministic case — scratch row accumulates the product.
    const scratch = new Uint8Array(stride);
    for (let i = 0; i < n; i++) {
      if (this.get(i, a) === 1) {
        // Accumulate stabilizer row (n + i) into scratch.
        let g = 0;
        for (let q = 0; q < n; q++) {
          const x1 = this.get(n + i, q);
          const z1 = this.get(n + i, n + q);
          const x2 = scratch[q];
          const z2 = scratch[n + q];
          g += gFunction(x1, z1, x2, z2);
        }
        const total = 2 * scratch[2 * n] + 2 * this.r(n + i) + g;
        const mod4 = ((total % 4) + 4) % 4;
        scratch[2 * n] = mod4 === 2 ? 1 : 0;
        for (let c = 0; c < 2 * n; c++) scratch[c] ^= this.tab[(n + i) * stride + c];
      }
    }
    return scratch[2 * n];
  }

  /** Reset qubit a to |0⟩ — measure and conditionally flip. */
  resetQubit(a: number, rng: () => number): void {
    const outcome = this.measureZ(a, rng);
    if (outcome === 1) this.x(a);
  }

  /** Row addition with phase tracking. Adds row j into row h (mod 2 on
   *  the binary columns; tracked carefully on the phase bit). */
  private rowsum(h: number, j: number): void {
    const n = this.n;
    const stride = this.stride;
    let g = 0;
    for (let q = 0; q < n; q++) {
      const x1 = this.get(j, q);
      const z1 = this.get(j, n + q);
      const x2 = this.get(h, q);
      const z2 = this.get(h, n + q);
      g += gFunction(x1, z1, x2, z2);
    }
    const total = 2 * this.r(h) + 2 * this.r(j) + g;
    const mod4 = ((total % 4) + 4) % 4;
    this.setR(h, mod4 === 2 ? 1 : 0);
    for (let c = 0; c < 2 * n; c++) {
      this.tab[h * stride + c] ^= this.tab[j * stride + c];
    }
  }

  // ─── Single-qubit Pauli extraction ───────────────────────────────────

  /**
   * Return the per-qubit Bloch vector implied by the stabilizer group.
   * A qubit is either in a Pauli eigenstate (Bloch length 1, axis along
   * ±X/±Y/±Z) or maximally mixed (Bloch = 0) — those are the only
   * possibilities for the reduced single-qubit state of a stabilizer
   * pure state.
   *
   * Algorithm: row-reduce the stabilizer half of the tableau over GF(2),
   * removing the two columns belonging to qubit q. Any row that pivots
   * away to all-zeros in the trimmed columns is a Pauli on q alone (up
   * to overall sign), and the (x_q, z_q, phase) triple identifies which.
   * O(n³) per qubit, called once per simulate(); cheap relative to gate
   * application.
   */
  blochVectors(): { x: number; y: number; z: number }[] {
    const n = this.n;
    const out: { x: number; y: number; z: number }[] = new Array(n);
    // Build a working copy of the stabilizer rows: n × (2n + 1) Uint8Array.
    // We mutate this per qubit, so allocate fresh each iteration.
    for (let q = 0; q < n; q++) {
      out[q] = this.singleQubitBloch(q);
    }
    return out;
  }

  private singleQubitBloch(q: number): { x: number; y: number; z: number } {
    const n = this.n;
    const stride = 2 * n + 1;
    // Copy stabilizer rows.
    const M = new Uint8Array(n * stride);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < stride; c++) {
        M[i * stride + c] = this.tab[(n + i) * stride + c];
      }
    }
    // Columns to eliminate to zero: every column except x_q (=q), z_q (=n+q),
    // and the phase column (=2n). We row-reduce on the "other" 2n-2 columns;
    // any row reduced to zero there represents a Pauli on q alone.
    const elimCols: number[] = [];
    for (let c = 0; c < 2 * n; c++) {
      if (c !== q && c !== n + q) elimCols.push(c);
    }
    let row = 0;
    for (const c of elimCols) {
      // Find a pivot row at or below `row` with a 1 in column c.
      let pivot = -1;
      for (let i = row; i < n; i++) {
        if (M[i * stride + c]) { pivot = i; break; }
      }
      if (pivot === -1) continue;
      if (pivot !== row) {
        // Swap row and pivot.
        for (let cc = 0; cc < stride; cc++) {
          const tmp = M[row * stride + cc];
          M[row * stride + cc] = M[pivot * stride + cc];
          M[pivot * stride + cc] = tmp;
        }
      }
      // Eliminate column c in all other rows.
      for (let i = 0; i < n; i++) {
        if (i === row) continue;
        if (M[i * stride + c]) {
          for (let cc = 0; cc < stride; cc++) {
            M[i * stride + cc] ^= M[row * stride + cc];
          }
        }
      }
      row++;
      if (row === n) break;
    }
    // Now any row with all zeros in elimCols is a single-qubit Pauli on q.
    // Scan from row `row` downwards (the unpivoted rows). After the loop, the
    // pivoted rows have one nonzero in their pivot column, so they're not q-only.
    // The unpivoted rows may also encode q-only Paulis.
    let bestX = 0, bestZ = 0, bestR = 0, found = false;
    for (let i = 0; i < n; i++) {
      // Verify the row is zero in elimCols.
      let zero = true;
      for (const c of elimCols) {
        if (M[i * stride + c]) { zero = false; break; }
      }
      if (!zero) continue;
      const xq = M[i * stride + q];
      const zq = M[i * stride + n + q];
      if (xq === 0 && zq === 0) continue; // identity — no info
      bestX = xq;
      bestZ = zq;
      bestR = M[i * stride + 2 * n];
      found = true;
      break;
    }
    if (!found) return { x: 0, y: 0, z: 0 };
    const sign = bestR ? -1 : 1;
    if (bestX === 1 && bestZ === 0) return { x: sign, y: 0, z: 0 };
    if (bestX === 0 && bestZ === 1) return { x: 0, y: 0, z: sign };
    return { x: 0, y: sign, z: 0 }; // (1,1) → Y
  }
}

// ─── Public dispatch (used by simulate.ts) ──────────────────────────────

/** Gate ids that are Clifford and routable through Stabilizer. */
const CLIFFORD_GATES = new Set([
  "i", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg",
  "cx", "cy", "cz", "swap",
]);

/** Measurement / reset are well-defined on stabilizer states via
 *  Aaronson-Gottesman §4. The fast path handles them per-trajectory. */
const CLIFFORD_MEASUREMENTS = new Set(["measure", "measure_x", "measure_y", "reset"]);

/** Gate ids that are no-ops or already represented (barrier, delay, init0). */
const CLIFFORD_NOOPS = new Set(["barrier", "delay", "init0"]);

/** g(x1, z1, x2, z2) from Aaronson-Gottesman §4.1 — the symplectic phase
 *  contribution per qubit when multiplying two Pauli strings. */
function gFunction(x1: number, z1: number, x2: number, z2: number): number {
  if (x1 === 0 && z1 === 0) return 0;
  if (x1 === 1 && z1 === 1) return z2 - x2;
  if (x1 === 1 && z1 === 0) return z2 * (2 * x2 - 1);
  return x2 * (1 - 2 * z2);
}

/**
 * Return true if every gate in `gates` is either Clifford or a representable
 * no-op (markers, prep |0⟩). Anti-controls are allowed — the standard X-flip
 * bracketing reduces them to a sequence of X then Clifford then X.
 */
export function isCliffordOnly(gates: ReadonlyArray<{ gateId: string }>): boolean {
  for (const g of gates) {
    if (
      !CLIFFORD_GATES.has(g.gateId) &&
      !CLIFFORD_NOOPS.has(g.gateId) &&
      !CLIFFORD_MEASUREMENTS.has(g.gateId)
    ) return false;
  }
  return true;
}

/**
 * Apply a sequence of placed gates to a fresh `Stabilizer`. Supports anti-
 * controls via X-flip bracketing on the negated control qubits, matching
 * the statevector path's behavior.
 */
export function runClifford(
  n: number,
  gates: ReadonlyArray<{
    gateId: string;
    controls: number[];
    targets: number[];
    clbits: number[];
    controlStates?: boolean[];
    condition?: { clbit: number; value: number };
  }>,
  rng: () => number = Math.random,
  numClbits = 0,
): { tab: Stabilizer; classical: Uint8Array } {
  const tab = new Stabilizer(n);
  const classical = new Uint8Array(Math.max(1, numClbits));
  for (const g of gates) {
    if (CLIFFORD_NOOPS.has(g.gateId)) continue;
    if (g.condition && classical[g.condition.clbit] !== g.condition.value) continue;
    if (g.gateId === "measure") { classical[g.clbits[0]] = tab.measureZ(g.targets[0], rng); continue; }
    if (g.gateId === "measure_x") {
      tab.h(g.targets[0]);
      classical[g.clbits[0]] = tab.measureZ(g.targets[0], rng);
      tab.h(g.targets[0]);
      continue;
    }
    if (g.gateId === "measure_y") {
      tab.sdg(g.targets[0]); tab.h(g.targets[0]);
      classical[g.clbits[0]] = tab.measureZ(g.targets[0], rng);
      tab.h(g.targets[0]); tab.s(g.targets[0]);
      continue;
    }
    if (g.gateId === "reset") { tab.resetQubit(g.targets[0], rng); continue; }
    const antis: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antis.push(g.controls[i]);
      }
    }
    for (const q of antis) tab.x(q);
    applyClifford(tab, g);
    for (const q of antis) tab.x(q);
  }
  return { tab, classical };
}

/**
 * Run a Clifford circuit `shots` times, sampling fresh measurement outcomes
 * each shot. Returns a Map from bitstring (over the active classical bits)
 * to count. Used by the Syndromes panel — the bread-and-butter of QEC
 * research (decoder benchmarks, detector slice histograms, etc.).
 */
export function sampleSyndromes(
  n: number,
  gates: Parameters<typeof runClifford>[1],
  numClbits: number,
  shots: number,
  noise?: {
    oneQubitDepolarising: number;
    twoQubitDepolarising: number;
    perGate?: Record<string, number>;
  },
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let s = 0; s < shots; s++) {
    const classical = noise
      ? runCliffordNoisy(n, gates, Math.random, numClbits, noise).classical
      : runClifford(n, gates, Math.random, numClbits).classical;
    const key = Array.from(classical.slice(0, numClbits)).reverse().join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Pauli frame tracking for Clifford+depolarising noise.
 *
 * The frame is a Pauli string F = ⊗_q F_q over the n qubits, encoded as
 * a 2n binary array: f[q] = x_q bit, f[n + q] = z_q bit. I = (0,0),
 * X = (1,0), Z = (0,1), Y = (1,1). Sign is ignored — we only need
 * X-vs-not-X for measurement-outcome flipping.
 *
 * Propagation through Clifford gates uses the standard symplectic
 * conjugation rules (H, S, CX). All Pauli gates (X, Y, Z) and gates
 * built from them leave the frame bits unchanged (they only contribute
 * signs we discard).
 *
 * Noise injection per gate: with the gate's depolarising rate p, sample
 * a uniform non-identity Pauli on the involved qubit(s) and XOR it
 * into F. Measurement of qubit q reads the noise-free outcome from the
 * tableau and XORs it with f[q] (the X-bit, which determines whether
 * F anticommutes with Z_q).
 *
 * This lets QEC syndrome benchmarks run under depolarising noise at the
 * full 1024-qubit stabilizer cap — Stim's headline workload, in a
 * browser tab.
 */

type Frame = Uint8Array;

/** Frame rule for H on qubit a: swap x and z. */
function frameH(f: Frame, n: number, a: number): void {
  const xa = f[a];
  f[a] = f[n + a];
  f[n + a] = xa;
}
/** Frame rule for S on qubit a: z ^= x. */
function frameS(f: Frame, n: number, a: number): void {
  f[n + a] ^= f[a];
}
/** Frame rule for √X on qubit a: x ^= z. */
function frameSX(f: Frame, n: number, a: number): void {
  f[a] ^= f[n + a];
}
/** Frame rule for CX (control c, target t). */
function frameCX(f: Frame, n: number, c: number, t: number): void {
  f[t] ^= f[c];          // X_c → X_c X_t
  f[n + c] ^= f[n + t];  // Z_t → Z_c Z_t
}
/** Frame rule for CZ (c, t). */
function frameCZ(f: Frame, n: number, c: number, t: number): void {
  f[n + t] ^= f[c];      // X_c → X_c Z_t
  f[n + c] ^= f[t];      // X_t → Z_c X_t
}
/** Frame rule for SWAP — swap entries. */
function frameSWAP(f: Frame, n: number, a: number, b: number): void {
  const xa = f[a], za = f[n + a];
  f[a] = f[b]; f[n + a] = f[n + b];
  f[b] = xa; f[n + b] = za;
}

/** Propagate frame through one Clifford gate (no-op for I/X/Y/Z; bit
 *  swaps / XORs for H/S/√X; pairwise for CX/CZ/CY/SWAP). */
function propagateFrame(
  f: Frame,
  n: number,
  g: { gateId: string; controls: number[]; targets: number[] },
): void {
  switch (g.gateId) {
    case "i": case "x": case "y": case "z": return;
    case "h": frameH(f, n, g.targets[0]); return;
    case "s": frameS(f, n, g.targets[0]); return;
    case "sdg":
      // Sdg = SSS; type-effect equals S.
      frameS(f, n, g.targets[0]); return;
    case "sx": frameSX(f, n, g.targets[0]); return;
    case "sxdg":
      frameSX(f, n, g.targets[0]); return;
    case "cx": frameCX(f, n, g.controls[0], g.targets[0]); return;
    case "cy": {
      const c = g.controls[0], t = g.targets[0];
      // CY = (I ⊗ Sdg) CX (I ⊗ S). Type-effect = S, CX, S.
      frameS(f, n, t); frameCX(f, n, c, t); frameS(f, n, t); return;
    }
    case "cz": frameCZ(f, n, g.controls[0], g.targets[0]); return;
    case "swap": frameSWAP(f, n, g.targets[0], g.targets[1]); return;
  }
}

/** Inject a 1-qubit depolarising Pauli error on qubit q with probability p. */
function frameDepol1(f: Frame, n: number, q: number, p: number): void {
  if (p <= 0 || Math.random() >= p) return;
  const r = Math.random();
  if (r < 1 / 3) f[q] ^= 1;                    // X
  else if (r < 2 / 3) { f[q] ^= 1; f[n + q] ^= 1; } // Y
  else f[n + q] ^= 1;                          // Z
}
/** Inject a 2-qubit depolarising Pauli error on (a, b) with probability p. */
function frameDepol2(f: Frame, n: number, a: number, b: number, p: number): void {
  if (p <= 0 || Math.random() >= p) return;
  // Sample uniform non-identity over 15 pairs (one of 16 minus identity).
  const idx = Math.floor(Math.random() * 15);
  const pa = Math.floor(idx / 4); // 0..3
  let pb = idx % 4;
  if (pa === 0 && pb === 0) pb = 3; // map (I,I) slot to (I,Z) — keeps 15 outcomes
  if (pa & 1) f[a] ^= 1;
  if (pa & 2) f[n + a] ^= 1;
  if (pb & 1) f[b] ^= 1;
  if (pb & 2) f[n + b] ^= 1;
}

/**
 * Run a Clifford circuit under stochastic Pauli (depolarising) noise via
 * frame tracking. Outcome: a `classical` register and the final Pauli
 * frame, plus the tableau state for further inspection.
 *
 * Per-gate rate selection: `perGate[gate.gateId]` first, then
 * `oneQubitDepolarising` / `twoQubitDepolarising` global based on arity.
 */
export function runCliffordNoisy(
  n: number,
  gates: Parameters<typeof runClifford>[1],
  rng: () => number,
  numClbits: number,
  noise: {
    oneQubitDepolarising: number;
    twoQubitDepolarising: number;
    perGate?: Record<string, number>;
  },
): { tab: Stabilizer; classical: Uint8Array; frame: Uint8Array } {
  const tab = new Stabilizer(n);
  const classical = new Uint8Array(Math.max(1, numClbits));
  const frame: Frame = new Uint8Array(2 * n);

  for (const g of gates) {
    if (CLIFFORD_NOOPS.has(g.gateId)) continue;
    if (g.condition && classical[g.condition.clbit] !== g.condition.value) continue;

    if (g.gateId === "measure") {
      const q = g.targets[0];
      const outcomeClean = tab.measureZ(q, rng);
      const flip = frame[q]; // X-bit on q
      classical[g.clbits[0]] = outcomeClean ^ flip;
      frame[q] = 0;
      frame[n + q] = 0;
      continue;
    }
    if (g.gateId === "measure_x") {
      // Rotate, measure, rotate back: frame propagates through H.
      tab.h(q(g)); frameH(frame, n, q(g));
      const out = tab.measureZ(q(g), rng);
      classical[g.clbits[0]] = out ^ frame[q(g)];
      frame[q(g)] = 0; frame[n + q(g)] = 0;
      tab.h(q(g)); frameH(frame, n, q(g));
      continue;
    }
    if (g.gateId === "measure_y") {
      tab.sdg(q(g)); frameS(frame, n, q(g));
      tab.h(q(g)); frameH(frame, n, q(g));
      const out = tab.measureZ(q(g), rng);
      classical[g.clbits[0]] = out ^ frame[q(g)];
      frame[q(g)] = 0; frame[n + q(g)] = 0;
      tab.h(q(g)); frameH(frame, n, q(g));
      tab.s(q(g)); frameS(frame, n, q(g));
      continue;
    }
    if (g.gateId === "reset") {
      tab.resetQubit(q(g), rng);
      frame[q(g)] = 0; frame[n + q(g)] = 0;
      continue;
    }
    // Apply gate to tableau (with anti-control X-bracketing) AND propagate frame.
    const antis: number[] = [];
    if (g.controlStates) {
      for (let i = 0; i < g.controls.length; i++) {
        if (g.controlStates[i] === false) antis.push(g.controls[i]);
      }
    }
    for (const a of antis) { tab.x(a); /* X doesn't update frame bits */ }
    applyCliffordSwitch(tab, g);
    propagateFrame(frame, n, g);
    for (const a of antis) tab.x(a);

    // Inject error.
    const arity = g.controls.length + g.targets.length;
    const perGate = noise.perGate?.[g.gateId];
    if (arity === 1) {
      frameDepol1(frame, n, g.targets[0], perGate ?? noise.oneQubitDepolarising);
    } else if (arity === 2) {
      const involved = [...g.controls, ...g.targets];
      frameDepol2(frame, n, involved[0], involved[1], perGate ?? noise.twoQubitDepolarising);
    } else {
      const involved = [...g.controls, ...g.targets];
      for (const qu of involved) frameDepol1(frame, n, qu, perGate ?? noise.twoQubitDepolarising);
    }
  }
  return { tab, classical, frame };
}

function q(g: { targets: number[] }): number { return g.targets[0]; }

function applyCliffordSwitch(tab: Stabilizer, g: { gateId: string; controls: number[]; targets: number[] }): void {
  switch (g.gateId) {
    case "i": return;
    case "x": return tab.x(g.targets[0]);
    case "y": return tab.y(g.targets[0]);
    case "z": return tab.z(g.targets[0]);
    case "h": return tab.h(g.targets[0]);
    case "s": return tab.s(g.targets[0]);
    case "sdg": return tab.sdg(g.targets[0]);
    case "sx": return tab.sx(g.targets[0]);
    case "sxdg": return tab.sxdg(g.targets[0]);
    case "cx": return tab.cnot(g.controls[0], g.targets[0]);
    case "cy": return tab.cy(g.controls[0], g.targets[0]);
    case "cz": return tab.cz(g.controls[0], g.targets[0]);
    case "swap": return tab.swap(g.targets[0], g.targets[1]);
  }
}

function applyClifford(tab: Stabilizer, g: {
  gateId: string;
  controls: number[];
  targets: number[];
}): void {
  switch (g.gateId) {
    case "i": return;
    case "x": return tab.x(g.targets[0]);
    case "y": return tab.y(g.targets[0]);
    case "z": return tab.z(g.targets[0]);
    case "h": return tab.h(g.targets[0]);
    case "s": return tab.s(g.targets[0]);
    case "sdg": return tab.sdg(g.targets[0]);
    case "sx": return tab.sx(g.targets[0]);
    case "sxdg": return tab.sxdg(g.targets[0]);
    case "cx": return tab.cnot(g.controls[0], g.targets[0]);
    case "cy": return tab.cy(g.controls[0], g.targets[0]);
    case "cz": return tab.cz(g.controls[0], g.targets[0]);
    case "swap": return tab.swap(g.targets[0], g.targets[1]);
    default:
      throw new Error(`stabilizer: unhandled gate "${g.gateId}"`);
  }
}
