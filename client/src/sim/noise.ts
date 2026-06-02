/**
 * Noise models for the simulator. Strict opt-in — when `enabled` is false,
 * the fast statevector path in `simulate()` runs untouched.
 *
 * The implementation uses the **quantum trajectories** method (a.k.a.
 * Monte Carlo wave function): each trajectory is one pure-state run of
 * the circuit with stochastic channels inserted after each gate.
 * Averaging derived quantities across T trajectories converges to the
 * true noisy expectation values. Memory stays at the statevector cap
 * (2 · 2ⁿ doubles) rather than blowing up to 2 · 4ⁿ for a density-matrix
 * sim, so the noise mode reaches n ≈ 16 in practice.
 *
 * Channels implemented:
 *   • single-qubit depolarising (p₁): I with prob 1-p, X/Y/Z each p/3
 *   • two-qubit depolarising  (p₂): I⊗I with prob 1-p, the other 15
 *     non-identity Pauli pairs each p/15
 *   • amplitude damping (γ_AD): the T1 channel. State-conditional —
 *     with probability γ·|⟨1|ψ_q⟩|² the qubit jumps to |0⟩; else its
 *     |1⟩ amplitude is attenuated by √(1-γ) and the state renormalised.
 *   • phase damping (γ_PD): the pure-dephasing T2 channel. Same K_0 as
 *     AD; the jump branch projects to |1⟩.
 *   • readout bit-flip (p_r): bit flip applied at measurement time.
 *     Inert until mid-circuit measurement lands; the field is reserved
 *     so an IBM backend import populates it correctly today.
 *
 * Three-or-more-qubit unitaries (CCX, MCX, etc.) receive 1-qubit
 * depolarising at rate p₂ on every involved qubit and 1-qubit damping
 * at the same per-qubit rates. This is the standard "local channel"
 * simplification used in Qiskit/Cirq.
 *
 * Per-qubit overrides: `perQubit[q]` populates a partial channel record
 * for qubit q; missing fields fall back to the global rates. IBM
 * backend imports populate this array per device qubit.
 */

export type PerQubitRates = {
  oneQubitDepolarising?: number;
  amplitudeDamping?: number;
  phaseDamping?: number;
  readoutBitFlip?: number;
};

export type NoiseModel = {
  enabled: boolean;
  /** Number of trajectories to average. Higher = smoother, linear cost. */
  trajectories: number;
  /** Global single-qubit gate depolarising probability. */
  oneQubitDepolarising: number;
  /** Global two-qubit gate depolarising probability. */
  twoQubitDepolarising: number;
  /** Global per-gate amplitude damping (T1) probability. */
  amplitudeDamping: number;
  /** Global per-gate phase damping (T2) probability. */
  phaseDamping: number;
  /** Global measurement readout error probability. */
  readoutBitFlip: number;
  /** Per-gate crosstalk: when a 2-qubit gate fires between (a, b), every
   *  neighbour of a (in `coupling`) other than b gets 1-qubit depolarising
   *  at this rate, and likewise for b. Models "spectator" error from
   *  unwanted excitations on coupled neighbours during a two-qubit
   *  interaction. Inert when `coupling` is absent. */
  crosstalk: number;
  /** Coupling map / adjacency list. coupling[q] = neighbour qubit indices.
   *  Populated by the IBM importer from the device's `coupling_map` and
   *  used by the crosstalk channel. */
  coupling?: number[][];
  /** User-defined single-qubit Kraus channel. Each operator is a 2×2
   *  complex matrix as a row-major array of 8 floats: [Re00, Im00, Re01,
   *  Im01, Re10, Im10, Re11, Im11]. Applied after every 1-qubit gate on
   *  the target qubit via state-conditional sampling. Channel should be
   *  trace-preserving (Σ Kᵢ† Kᵢ = I) — we do not enforce this. */
  customKraus?: {
    enabled: boolean;
    name: string;
    operators: number[][];
  };
  /** User-defined two-qubit Kraus channel. Each operator is a 4×4 complex
   *  matrix as a row-major array of 32 floats. Applied after every 2-qubit
   *  gate on the involved (q0, q1) pair via state-conditional sampling.
   *  Channel should be trace-preserving (Σ Kᵢ† Kᵢ = I); not enforced. */
  customKraus2q?: {
    enabled: boolean;
    name: string;
    operators: number[][];
  };
  /** Per-qubit overrides. Length matches the circuit width when set by
   *  the importer; out-of-range qubits fall back to the global rates. */
  perQubit?: PerQubitRates[];
  /** Per-gate-id depolarising rate. Keys are gate IDs in the IR
   *  (`sx`, `x`, `cx`, `cz`, `ecr`, etc.). When present, overrides
   *  `oneQubitDepolarising` / `twoQubitDepolarising` for matching gates.
   *  Populated by the IBM importer from `gate_error` entries — aggregated
   *  by gate name across qubits (median). Real-device emulation: sx
   *  errors are typically 10× smaller than cx errors; per-gate rates
   *  capture that, the globals can't. */
  perGate?: Record<string, number>;
  /** Free-form note populated by the importer (device name + snapshot
   *  date) so the user can see which device the calibration came from. */
  source?: string;
};

export const DEFAULT_NOISE: NoiseModel = {
  enabled: false,
  trajectories: 256,
  oneQubitDepolarising: 0.001,
  twoQubitDepolarising: 0.01,
  amplitudeDamping: 0,
  phaseDamping: 0,
  readoutBitFlip: 0.02,
  crosstalk: 0,
};

/**
 * Device-style noise presets. Rates are rough public-record averages —
 * use the IBM JSON importer for accurate per-qubit calibration. Picking
 * a preset only overrides the noise rates; trajectories and the noise
 * `enabled` flag are left to the caller so the user's session settings
 * survive a preset selection.
 */
export type NoisePresetId = "demo" | "ibm-heron" | "google-sycamore" | "ionq-aria";

export const NOISE_PRESETS: Record<NoisePresetId, { label: string; rates: Partial<NoiseModel> }> = {
  demo: {
    label: "Demo (visible)",
    rates: {
      oneQubitDepolarising: 0.01,
      twoQubitDepolarising: 0.05,
      amplitudeDamping: 0.005,
      phaseDamping: 0.005,
      readoutBitFlip: 0.05,
      crosstalk: 0.001,
    },
  },
  "ibm-heron": {
    label: "IBM Heron (typical)",
    rates: {
      oneQubitDepolarising: 0.0003,
      twoQubitDepolarising: 0.005,
      amplitudeDamping: 0.0005,
      phaseDamping: 0.0005,
      readoutBitFlip: 0.015,
      crosstalk: 0,
    },
  },
  "google-sycamore": {
    label: "Google Sycamore",
    rates: {
      oneQubitDepolarising: 0.0015,
      twoQubitDepolarising: 0.006,
      amplitudeDamping: 0.001,
      phaseDamping: 0.001,
      readoutBitFlip: 0.018,
      crosstalk: 0,
    },
  },
  "ionq-aria": {
    label: "IonQ Aria (typical)",
    rates: {
      oneQubitDepolarising: 0.0004,
      twoQubitDepolarising: 0.003,
      amplitudeDamping: 0.0002,
      phaseDamping: 0.0002,
      readoutBitFlip: 0.005,
      crosstalk: 0,
    },
  },
};

const STORAGE_KEY = "quantiom:noise:v2";

export function loadNoise(): NoiseModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOISE };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOISE,
      ...parsed,
      oneQubitDepolarising: clamp01(parsed.oneQubitDepolarising ?? DEFAULT_NOISE.oneQubitDepolarising),
      twoQubitDepolarising: clamp01(parsed.twoQubitDepolarising ?? DEFAULT_NOISE.twoQubitDepolarising),
      amplitudeDamping: clamp01(parsed.amplitudeDamping ?? DEFAULT_NOISE.amplitudeDamping),
      phaseDamping: clamp01(parsed.phaseDamping ?? DEFAULT_NOISE.phaseDamping),
      readoutBitFlip: clamp01(parsed.readoutBitFlip ?? DEFAULT_NOISE.readoutBitFlip),
      crosstalk: clamp01(parsed.crosstalk ?? DEFAULT_NOISE.crosstalk),
      trajectories: Math.max(1, Math.min(8192, parsed.trajectories ?? DEFAULT_NOISE.trajectories)),
      perQubit: Array.isArray(parsed.perQubit) ? parsed.perQubit.map(sanitisePerQubit) : undefined,
      coupling: Array.isArray(parsed.coupling) ? parsed.coupling : undefined,
      perGate: typeof parsed.perGate === "object" && parsed.perGate !== null
        ? Object.fromEntries(
            Object.entries(parsed.perGate as Record<string, unknown>)
              .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
              .map(([k, v]) => [k, clamp01(v as number)]),
          )
        : undefined,
      customKraus: parsed.customKraus && typeof parsed.customKraus === "object" && Array.isArray(parsed.customKraus.operators)
        ? {
            enabled: !!parsed.customKraus.enabled,
            name: typeof parsed.customKraus.name === "string" ? parsed.customKraus.name : "custom",
            operators: parsed.customKraus.operators
              .filter((op: unknown) => Array.isArray(op) && (op as unknown[]).length === 8 && (op as unknown[]).every((v) => Number.isFinite(v)))
              .map((op: number[]) => [...op]),
          }
        : undefined,
      customKraus2q: parsed.customKraus2q && typeof parsed.customKraus2q === "object" && Array.isArray(parsed.customKraus2q.operators)
        ? {
            enabled: !!parsed.customKraus2q.enabled,
            name: typeof parsed.customKraus2q.name === "string" ? parsed.customKraus2q.name : "custom-2q",
            operators: parsed.customKraus2q.operators
              .filter((op: unknown) => Array.isArray(op) && (op as unknown[]).length === 32 && (op as unknown[]).every((v) => Number.isFinite(v)))
              .map((op: number[]) => [...op]),
          }
        : undefined,
    };
  } catch {
    return { ...DEFAULT_NOISE };
  }
}

export function saveNoise(n: NoiseModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
  } catch {
    /* ignore quota errors */
  }
}

/** Resolve the rate for a given (kind, qubit), falling back to globals. */
export function rateFor(
  noise: NoiseModel,
  kind: keyof PerQubitRates,
  qubit: number,
): number {
  const pq = noise.perQubit?.[qubit];
  const override = pq?.[kind];
  if (typeof override === "number") return override;
  switch (kind) {
    case "oneQubitDepolarising": return noise.oneQubitDepolarising;
    case "amplitudeDamping": return noise.amplitudeDamping;
    case "phaseDamping": return noise.phaseDamping;
    case "readoutBitFlip": return noise.readoutBitFlip;
  }
}

function sanitisePerQubit(p: unknown): PerQubitRates {
  if (typeof p !== "object" || p === null) return {};
  const r: PerQubitRates = {};
  const o = p as Record<string, unknown>;
  if (typeof o.oneQubitDepolarising === "number") r.oneQubitDepolarising = clamp01(o.oneQubitDepolarising);
  if (typeof o.amplitudeDamping === "number") r.amplitudeDamping = clamp01(o.amplitudeDamping);
  if (typeof o.phaseDamping === "number") r.phaseDamping = clamp01(o.phaseDamping);
  if (typeof o.readoutBitFlip === "number") r.readoutBitFlip = clamp01(o.readoutBitFlip);
  return r;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// ─── IBM BackendProperties importer ────────────────────────────────────

/**
 * Parse an IBM Quantum `BackendProperties` JSON snapshot into a NoiseModel.
 * These snapshots come from Qiskit's `backend.properties().to_dict()` and
 * have the shape:
 *
 *   { backend_name, last_update_date,
 *     qubits: [ [ {name:"T1", value:1.0e-4}, {name:"T2", ...}, {name:"readout_error", ...}, ... ], ... ],
 *     gates:  [ { gate:"sx", qubits:[0], parameters:[{name:"gate_error", value:5e-4}, {name:"gate_length", value:35e-9}] }, ... ] }
 *
 * T1/T2 are converted into per-gate damping probabilities using a
 * representative one-qubit gate time (median sx gate_length, defaulting
 * to 35 ns when the field is absent). Single-qubit depolarising uses
 * each qubit's median sx gate_error; two-qubit uses the median cx
 * gate_error across the device. Readout error pulls directly from the
 * qubit record.
 */
export function importIbmBackend(json: string): NoiseModel {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.qubits)) {
    throw new Error("not an IBM BackendProperties snapshot (missing qubits array)");
  }
  const numQubits = parsed.qubits.length;
  const gates: unknown[] = Array.isArray(parsed.gates) ? parsed.gates : [];

  // Median 1q gate time (sx or x) across the device.
  const oneQubitTimes: number[] = [];
  for (const g of gates) {
    const e = g as Record<string, unknown>;
    if (e.gate === "sx" || e.gate === "x" || e.gate === "rz") {
      const t = paramValue(e.parameters, "gate_length");
      if (typeof t === "number") oneQubitTimes.push(t);
    }
  }
  const gateTime = oneQubitTimes.length > 0 ? median(oneQubitTimes) : 35e-9;

  // Per-qubit T1, T2, readout, sx error.
  const perQubit: PerQubitRates[] = new Array(numQubits);
  for (let q = 0; q < numQubits; q++) {
    const props = parsed.qubits[q] as unknown[];
    const t1 = qubitProperty(props, "T1");
    const t2 = qubitProperty(props, "T2");
    const readout = qubitProperty(props, "readout_error");
    const sxErr = findGateError(gates, ["sx", "x"], [q]);
    const ad = typeof t1 === "number" && t1 > 0 ? 1 - Math.exp(-gateTime / t1) : 0;
    // T2 in IBM convention includes T1 — pure dephasing rate uses
    // 1/Tφ = 1/T2 - 1/(2·T1). We use T2 directly as the phase-damping
    // time scale here; over-conservative but representative.
    const pd = typeof t2 === "number" && t2 > 0 ? 1 - Math.exp(-gateTime / t2) : 0;
    perQubit[q] = {
      oneQubitDepolarising: typeof sxErr === "number" ? clamp01(sxErr) : undefined,
      amplitudeDamping: clamp01(ad),
      phaseDamping: clamp01(pd),
      readoutBitFlip: typeof readout === "number" ? clamp01(readout) : undefined,
    };
  }

  // Global 2q rate: median cx gate_error across all coupled pairs.
  const cxErrors: number[] = [];
  for (const g of gates) {
    const e = g as Record<string, unknown>;
    if (e.gate === "cx" || e.gate === "cz" || e.gate === "ecr") {
      const err = paramValue(e.parameters, "gate_error");
      if (typeof err === "number") cxErrors.push(err);
    }
  }
  const twoQubitDepolarising = cxErrors.length > 0 ? clamp01(median(cxErrors)) : DEFAULT_NOISE.twoQubitDepolarising;

  // Globals fall back to per-qubit averages.
  const sxErrors = perQubit
    .map((p) => p.oneQubitDepolarising)
    .filter((v): v is number => typeof v === "number");
  const oneQubitDepolarising = sxErrors.length > 0 ? mean(sxErrors) : DEFAULT_NOISE.oneQubitDepolarising;
  const readouts = perQubit
    .map((p) => p.readoutBitFlip)
    .filter((v): v is number => typeof v === "number");
  const readoutBitFlip = readouts.length > 0 ? mean(readouts) : DEFAULT_NOISE.readoutBitFlip;
  const ads = perQubit.map((p) => p.amplitudeDamping ?? 0);
  const pds = perQubit.map((p) => p.phaseDamping ?? 0);

  const name = typeof parsed.backend_name === "string" ? parsed.backend_name : "imported";
  const date = typeof parsed.last_update_date === "string" ? parsed.last_update_date : "";

  // Coupling map: either parsed.coupling_map (direct field, an array of
  // [a, b] pairs) or inferred from the cx/cz/ecr gate entries.
  const coupling: number[][] = Array.from({ length: numQubits }, () => []);
  const addEdge = (a: number, b: number) => {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return;
    if (a < 0 || b < 0 || a >= numQubits || b >= numQubits) return;
    if (!coupling[a].includes(b)) coupling[a].push(b);
    if (!coupling[b].includes(a)) coupling[b].push(a);
  };
  if (Array.isArray(parsed.coupling_map)) {
    for (const pair of parsed.coupling_map) {
      if (Array.isArray(pair) && pair.length === 2) addEdge(pair[0], pair[1]);
    }
  } else {
    for (const g of gates) {
      const e = g as Record<string, unknown>;
      if ((e.gate === "cx" || e.gate === "cz" || e.gate === "ecr") && Array.isArray(e.qubits) && e.qubits.length === 2) {
        addEdge(e.qubits[0] as number, e.qubits[1] as number);
      }
    }
  }
  const couplingHasEdges = coupling.some((nbrs) => nbrs.length > 0);

  // Per-gate-id rates: collect every gate_error entry, bucket by gate name,
  // store the median per-bucket. IBM gate names (sx, x, cx, cz, ecr, reset)
  // match Quantiom IR ids directly; non-matching names are ignored.
  const buckets = new Map<string, number[]>();
  for (const g of gates) {
    const e = g as Record<string, unknown>;
    const name = typeof e.gate === "string" ? e.gate : null;
    if (!name) continue;
    const err = paramValue(e.parameters, "gate_error");
    if (typeof err !== "number") continue;
    const arr = buckets.get(name) ?? [];
    arr.push(err);
    buckets.set(name, arr);
  }
  const perGate: Record<string, number> = {};
  for (const [name, vals] of buckets) {
    perGate[name] = clamp01(median(vals));
  }

  return {
    enabled: true,
    trajectories: DEFAULT_NOISE.trajectories,
    oneQubitDepolarising,
    twoQubitDepolarising,
    amplitudeDamping: ads.length > 0 ? mean(ads) : 0,
    phaseDamping: pds.length > 0 ? mean(pds) : 0,
    readoutBitFlip,
    crosstalk: 0,
    perQubit,
    coupling: couplingHasEdges ? coupling : undefined,
    perGate: Object.keys(perGate).length > 0 ? perGate : undefined,
    source: `${name}${date ? ` @ ${date.slice(0, 10)}` : ""}`,
  };
}

function qubitProperty(props: unknown[], name: string): number | undefined {
  if (!Array.isArray(props)) return undefined;
  for (const p of props) {
    const e = p as Record<string, unknown>;
    if (e && e.name === name && typeof e.value === "number") return e.value;
  }
  return undefined;
}

function paramValue(params: unknown, name: string): number | undefined {
  if (!Array.isArray(params)) return undefined;
  for (const p of params) {
    const e = p as Record<string, unknown>;
    if (e && e.name === name && typeof e.value === "number") return e.value;
  }
  return undefined;
}

function findGateError(gates: unknown[], names: string[], qubits: number[]): number | undefined {
  for (const g of gates) {
    const e = g as Record<string, unknown>;
    if (!names.includes(e.gate as string)) continue;
    const gq = e.qubits;
    if (!Array.isArray(gq) || gq.length !== qubits.length) continue;
    if (qubits.every((q, i) => gq[i] === q)) {
      return paramValue(e.parameters, "gate_error");
    }
  }
  return undefined;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
