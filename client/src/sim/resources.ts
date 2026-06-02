import type { Circuit } from "../editor/types";
import { GATES_BY_ID } from "../editor/gates";

/**
 * Lightweight resource estimation — walks the gate list once and returns
 * counts that fault-tolerance researchers care about: T-count, two-qubit
 * count, parallel depth, etc. Pure derived from the IR; no simulation.
 *
 * Custom gate references count as one unit at this layer (they expand at
 * simulate time, but for a researcher reading "how big is this circuit?"
 * the structural view is what they want).
 */

export type Resources = {
  totalGates: number;
  oneQubit: number;
  twoQubit: number;
  multiQubit: number;
  measurements: number;
  parameterized: number;
  /** T or T† gates — the dominant non-Clifford cost in surface-code fault
   *  tolerance, where every T needs distillation. */
  tCount: number;
  /** Number of distinct circuit columns that contain at least one T or T†.
   *  Surface-code FT papers report T-depth, not just T-count: each
   *  parallel layer of T gates is one round of magic-state distillation. */
  tDepth: number;
  /** Number of CX gates (control-not). The dominant two-qubit cost. */
  cxCount: number;
  /** S/S†/H/CX/CZ/SWAP/X/Y/Z/I plus sx/sxdg — gates the Clifford fast path
   *  handles in O(n²) per gate. */
  cliffordCount: number;
  /** Maximum column index + 1 — the parallel depth assuming any gates in
   *  the same column commute (the canvas's ASAP scheduling). */
  parallelDepth: number;
  /** A naive sequential depth — the total gate count along the longest
   *  qubit. Useful for back-of-envelope serialised runtime. */
  longestQubitLength: number;
  /** Qubits that appear in any gate (excluding markers). */
  distinctQubits: number;
  /** Free parameter symbols referenced. */
  freeSymbols: number;
};

const T_GATES = new Set(["t", "tdg"]);
const CLIFFORD_GATES = new Set([
  "i", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg",
  "cx", "cy", "cz", "swap",
]);
const MARKER_GATES = new Set(["barrier", "delay"]);
const NON_UNITARY = new Set(["measure", "measure_x", "measure_y", "reset"]);

export function estimateResources(circuit: Circuit): Resources {
  let oneQubit = 0;
  let twoQubit = 0;
  let multiQubit = 0;
  let measurements = 0;
  let parameterized = 0;
  let tCount = 0;
  let cxCount = 0;
  let cliffordCount = 0;
  let parallelDepth = 0;
  const tColumns = new Set<number>();
  const perQubitLength = new Array<number>(circuit.numQubits).fill(0);
  const touchedQubits = new Set<number>();
  const freeSymbols = new Set<string>();

  for (const g of circuit.gates) {
    if (MARKER_GATES.has(g.gateId)) continue;
    parallelDepth = Math.max(parallelDepth, g.column + 1);

    if (NON_UNITARY.has(g.gateId)) {
      if (g.gateId !== "reset") measurements++;
      // Still touches a qubit.
      for (const q of g.targets) {
        touchedQubits.add(q);
        if (perQubitLength[q] !== undefined) perQubitLength[q]++;
      }
      continue;
    }

    const arity = g.controls.length + g.targets.length;
    if (arity === 1) oneQubit++;
    else if (arity === 2) twoQubit++;
    else multiQubit++;

    for (const q of g.controls) {
      touchedQubits.add(q);
      if (perQubitLength[q] !== undefined) perQubitLength[q]++;
    }
    for (const q of g.targets) {
      touchedQubits.add(q);
      if (perQubitLength[q] !== undefined) perQubitLength[q]++;
    }

    if (T_GATES.has(g.gateId)) { tCount++; tColumns.add(g.column); }
    if (g.gateId === "cx") cxCount++;
    if (CLIFFORD_GATES.has(g.gateId)) cliffordCount++;

    const def = GATES_BY_ID[g.gateId];
    if (def && def.params.length > 0) parameterized++;

    // Collect free symbols heuristically from param expressions.
    for (const p of g.params) {
      const matches = p.match(/[A-Za-z_α-ωΑ-Ω][A-Za-z_0-9]*/g);
      if (!matches) continue;
      for (const m of matches) {
        if (m === "pi" || m === "π" || m === "e" || m === "Math") continue;
        if (["sin", "cos", "tan", "sqrt", "exp", "ln", "log", "abs"].includes(m)) continue;
        freeSymbols.add(m);
      }
    }
  }

  let longest = 0;
  for (const v of perQubitLength) if (v > longest) longest = v;

  return {
    totalGates: oneQubit + twoQubit + multiQubit + measurements,
    oneQubit,
    twoQubit,
    multiQubit,
    measurements,
    parameterized,
    tCount,
    tDepth: tColumns.size,
    cxCount,
    cliffordCount,
    parallelDepth,
    longestQubitLength: longest,
    distinctQubits: touchedQubits.size,
    freeSymbols: freeSymbols.size,
  };
}
