/**
 * Tanner / check-connectivity graph derived from a circuit's measurement
 * structure. Each measurement is a *check* node; the data qubits it is
 * sensitive to are exactly the qubits in the backward causal cone of the
 * measured qubit up to that measurement — i.e. the support of the effective
 * stabilizer that measurement reads out. The result is the bipartite graph
 * (data qubits ↔ checks) that decoders consume: a repetition code shows
 * each check touching two neighbours, a surface-code plaquette shows
 * weight-4 checks, and so on.
 *
 * Purely structural (reuses `computeLightCone`); no simulation.
 */

import { computeLightCone } from "../editor/lightcone";
import type { Circuit } from "../editor/types";

const MEASURE = new Set(["measure", "measure_x", "measure_y"]);

export type TannerCheck = {
  id: string;
  /** Qubit being measured. */
  qubit: number;
  /** Classical bit written, if any. */
  clbit: number | null;
  label: string;
  /** Data qubits in this check's support (sorted). */
  support: number[];
};

export type TannerResult = {
  checks: TannerCheck[];
  numQubits: number;
};

export function tannerGraph(circuit: Circuit): TannerResult {
  const n = circuit.numQubits;
  const checks: TannerCheck[] = [];
  let idx = 0;
  // Stable order by column then qubit.
  const measurements = circuit.gates
    .filter((g) => MEASURE.has(g.gateId))
    .sort((a, b) => a.column - b.column || (a.targets[0] ?? 0) - (b.targets[0] ?? 0));

  for (const m of measurements) {
    const q = m.targets[0];
    if (q === undefined) continue;
    // Sub-circuit up to and including this measurement's column.
    const sub: Circuit = { ...circuit, gates: circuit.gates.filter((g) => g.column <= m.column) };
    const cone = computeLightCone(sub, q, "backward");
    const support = new Set<number>();
    for (const g of sub.gates) {
      if (!cone.has(g.id)) continue;
      if (MEASURE.has(g.gateId)) continue; // a check's support is data qubits, not other measurements
      for (const qq of [...g.controls, ...g.targets]) support.add(qq);
    }
    support.add(q); // the measured qubit itself is always in support
    const clbit = m.clbits?.[0] ?? null;
    checks.push({
      id: m.id,
      qubit: q,
      clbit,
      label: `c${idx}` + (clbit !== null ? `→cl${clbit}` : ""),
      support: [...support].sort((a, b) => a - b),
    });
    idx++;
  }
  return { checks, numQubits: n };
}
