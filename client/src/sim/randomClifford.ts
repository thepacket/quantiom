import type { Circuit, PlacedGate } from "../editor/types";
import { newGateId } from "../editor/state";

/**
 * Generate a random Clifford circuit on `n` qubits with `depth` columns of
 * gates drawn from {H, S, S†, X, Y, Z, √X, √X†, CX, CZ, SWAP}. Not a
 * uniformly-random sample of the Clifford group — the Bravyi-Maslov 2021
 * canonical form would be cleaner — but this is plenty for stress-testing
 * the stabilizer fast path and exercising the rendering pipeline at large
 * n.
 *
 * Per-column we ASAP-pack: each column gets a fresh choice of which qubits
 * are in 2q gates and which are 1q. Density is configurable via
 * `twoQubitFraction` ∈ [0, 1]; default 0.35 gives a balanced workload.
 *
 * The generator is pure: it builds and returns a brand-new Circuit object
 * with no side effects. The caller is responsible for opening it in a tab.
 */

const ONE_Q_GATES = ["h", "s", "sdg", "x", "y", "z", "sx", "sxdg"] as const;
const TWO_Q_GATES = ["cx", "cz", "swap"] as const;

export type RandomCliffordOptions = {
  numQubits: number;
  depth: number;
  /** Fraction of available qubits to use for 2q gates per column. */
  twoQubitFraction?: number;
  /** Optional seed for reproducibility (deterministic Mulberry32). */
  seed?: number;
};

export function randomCliffordCircuit(opts: RandomCliffordOptions): Circuit {
  const n = Math.max(1, Math.floor(opts.numQubits));
  const depth = Math.max(0, Math.floor(opts.depth));
  const twoQF = clamp(opts.twoQubitFraction ?? 0.35, 0, 1);
  const rand = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
  const gates: PlacedGate[] = [];
  for (let col = 0; col < depth; col++) {
    // Decide a pairing for this column: shuffle qubits, then take pairs from
    // the front for 2q gates and the rest for 1q gates. Qubits not assigned
    // to any gate stay idle this column (still a valid circuit).
    const order = shuffled(rangeArr(n), rand);
    let i = 0;
    const targetPairs = Math.min(Math.floor(n / 2), Math.round((n * twoQF) / 2));
    for (let p = 0; p < targetPairs; p++) {
      const a = order[i++], b = order[i++];
      const id = TWO_Q_GATES[Math.floor(rand() * TWO_Q_GATES.length)];
      if (id === "swap") {
        gates.push(make(id, [], [a, b], col));
      } else {
        // CX/CZ: a is control, b is target.
        gates.push(make(id, [a], [b], col));
      }
    }
    for (; i < order.length; i++) {
      const q = order[i];
      // 70% of remaining slots get a 1q gate; otherwise idle.
      if (rand() < 0.7) {
        const id = ONE_Q_GATES[Math.floor(rand() * ONE_Q_GATES.length)];
        gates.push(make(id, [], [q], col));
      }
    }
  }
  return {
    numQubits: n,
    numClbits: 0,
    name: `Random Clifford (n=${n}, depth=${depth})`,
    gates,
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function make(gateId: string, controls: number[], targets: number[], column: number): PlacedGate {
  return {
    id: newGateId(),
    gateId,
    controls,
    targets,
    clbits: [],
    params: [],
    column,
  };
}

function rangeArr(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
