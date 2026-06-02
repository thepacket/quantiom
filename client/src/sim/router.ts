import type { Circuit, PlacedGate } from "../editor/types";
import { newGateId } from "../editor/state";

/**
 * Greedy SWAP routing onto a coupling map.
 *
 * Walks the circuit gate by gate, maintaining a logical → physical qubit
 * mapping (initial: identity). For each 2-qubit gate on logical qubits
 * (a, b) whose physical placements aren't directly connected in the
 * coupling graph, the router finds the shortest path between them
 * (BFS — coupling graphs are small) and inserts a chain of SWAPs that
 * brings them adjacent. The 2q gate then applies on the now-adjacent
 * pair, and the mapping reflects the SWAPs permanently.
 *
 * This is the textbook "naïve router" — far from optimal, but a
 * baseline that researchers can compare against. It's enough to turn a
 * connectivity-violating circuit into a runnable one and read the
 * overhead from the gate-count diff.
 *
 * Single-qubit gates and >2-qubit gates pass through (the mapping just
 * relabels their target/control qubits). Measurements and resets also
 * relabel through the mapping. Conditions, anti-controls, params survive.
 */

export type RouteResult = {
  circuit: Circuit;
  swapsInserted: number;
  violationsBefore: number;
  /** Final logical → physical mapping at end of routing. */
  finalMapping: number[];
};

export function routeCircuit(circuit: Circuit, coupling: number[][]): RouteResult {
  const n = circuit.numQubits;
  // logical → physical
  const map = Array.from({ length: n }, (_, i) => i);
  const isConnected = (a: number, b: number) => {
    const nbrs = coupling[a];
    return !!nbrs && nbrs.includes(b);
  };
  // BFS shortest path on coupling graph between two physical qubits.
  const shortestPath = (start: number, goal: number): number[] => {
    if (start === goal) return [start];
    const seen = new Map<number, number>(); // child → parent
    const queue: number[] = [start];
    seen.set(start, -1);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const nbrs = coupling[cur] ?? [];
      for (const nb of nbrs) {
        if (seen.has(nb)) continue;
        seen.set(nb, cur);
        if (nb === goal) {
          const path: number[] = [goal];
          let p = cur;
          while (p !== -1) { path.unshift(p); p = seen.get(p)!; }
          return path;
        }
        queue.push(nb);
      }
    }
    return []; // disconnected — can't route
  };

  const out: PlacedGate[] = [];
  let swapsInserted = 0;
  let violationsBefore = 0;
  const sorted = [...circuit.gates].sort((a, b) => a.column - b.column || a.id.localeCompare(b.id));

  for (const g of sorted) {
    const involved = [...g.controls, ...g.targets];
    if (involved.length === 2 && g.gateId !== "swap") {
      const [logA, logB] = involved;
      const physA = map[logA], physB = map[logB];
      if (!isConnected(physA, physB)) {
        violationsBefore++;
        const path = shortestPath(physA, physB);
        if (path.length >= 2) {
          // Walk from physA toward physB; each step is a SWAP between adjacent
          // path nodes that "moves" logA one hop closer to physB. After the
          // walk, physA' is adjacent to physB.
          for (let i = 0; i < path.length - 2; i++) {
            const sA = path[i], sB = path[i + 1];
            out.push(swapGate(g, findLogicalForPhysical(map, sA), findLogicalForPhysical(map, sB)));
            // Update mapping: whatever was at sA now lives at sB and vice versa.
            const logSA = findLogicalForPhysical(map, sA);
            const logSB = findLogicalForPhysical(map, sB);
            map[logSA] = sB;
            map[logSB] = sA;
            swapsInserted++;
          }
        }
      }
    }
    // Now apply the gate with the relabelled controls/targets.
    const relabelled: PlacedGate = {
      ...g,
      id: newGateId(),
      params: [...g.params],
      controls: g.controls.map((q) => map[q]),
      targets: g.targets.map((q) => map[q]),
      clbits: [...g.clbits],
      controlStates: g.controlStates ? [...g.controlStates] : undefined,
      condition: g.condition ? { ...g.condition } : undefined,
    };
    out.push(relabelled);
    // If the gate is a SWAP itself, update the mapping.
    if (g.gateId === "swap" && g.targets.length === 2) {
      const [a, b] = g.targets;
      const physA = map[a], physB = map[b];
      map[a] = physB;
      map[b] = physA;
    }
  }

  // ASAP column re-pack.
  const nextColQ = new Array<number>(n).fill(0);
  const nextColC = new Array<number>(circuit.numClbits).fill(0);
  for (const g of out) {
    const qs = [...g.controls, ...g.targets];
    let col = 0;
    for (const q of qs) col = Math.max(col, nextColQ[q] ?? 0);
    for (const c of g.clbits) col = Math.max(col, nextColC[c] ?? 0);
    g.column = col;
    for (const q of qs) nextColQ[q] = col + 1;
    for (const c of g.clbits) nextColC[c] = col + 1;
  }

  return {
    circuit: {
      numQubits: circuit.numQubits,
      numClbits: circuit.numClbits,
      name: circuit.name ? `${circuit.name} (routed)` : "routed",
      gates: out,
    },
    swapsInserted,
    violationsBefore,
    finalMapping: map,
  };
}

function swapGate(template: PlacedGate, a: number, b: number): PlacedGate {
  return {
    id: newGateId(),
    gateId: "swap",
    column: template.column,
    controls: [],
    targets: [a, b],
    clbits: [],
    params: [],
  };
}

function findLogicalForPhysical(map: number[], phys: number): number {
  for (let i = 0; i < map.length; i++) if (map[i] === phys) return i;
  return phys;
}

/**
 * Count two-qubit gates whose qubit pair is not directly connected in the
 * coupling graph. Used by the Resources panel to surface "this circuit
 * doesn't fit your device" before the user even hits Route.
 */
export function countConnectivityViolations(circuit: Circuit, coupling: number[][]): number {
  let v = 0;
  for (const g of circuit.gates) {
    const involved = [...g.controls, ...g.targets];
    if (involved.length !== 2 || g.gateId === "swap") continue;
    const [a, b] = involved;
    const nbrs = coupling[a];
    if (!nbrs || !nbrs.includes(b)) v++;
  }
  return v;
}
