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

/** Gate ids that are no-ops or already represented (barrier, delay, init0). */
const CLIFFORD_NOOPS = new Set(["barrier", "delay", "init0"]);

/**
 * Return true if every gate in `gates` is either Clifford or a representable
 * no-op (markers, prep |0⟩). Anti-controls are allowed — the standard X-flip
 * bracketing reduces them to a sequence of X then Clifford then X.
 */
export function isCliffordOnly(gates: ReadonlyArray<{ gateId: string }>): boolean {
  for (const g of gates) {
    if (!CLIFFORD_GATES.has(g.gateId) && !CLIFFORD_NOOPS.has(g.gateId)) return false;
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
    controlStates?: boolean[];
  }>,
): Stabilizer {
  const tab = new Stabilizer(n);
  for (const g of gates) {
    if (CLIFFORD_NOOPS.has(g.gateId)) continue;
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
  return tab;
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
