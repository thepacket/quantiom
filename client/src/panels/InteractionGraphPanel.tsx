import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { interactionGraph } from "../sim/interaction";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };

const SIZE = 200;
const MAX_QUBITS = 24;

/**
 * Logical interaction graph. Qubits are nodes; an edge between i and j is
 * drawn whenever a multi-qubit gate acts on both, with thickness scaled by
 * how many times. This is the circuit's *logical* connectivity — compare
 * it against the hardware coupling map in the Noise panel to see how much
 * routing (SWAP insertion) a device will need before it can run.
 *
 * A Bell circuit lights one edge; a 1-D Trotter chain lights only
 * nearest-neighbour edges; a fully-connected ansatz lights the complete
 * graph. Cheap (pure topology, no simulation); default-collapsed.
 */
export function InteractionGraphPanel({ circuit }: Props) {
  return (
    <PanelShell id="interaction-graph" title="Interaction graph" defaultCollapsed>
      <Body circuit={circuit} />
    </PanelShell>
  );
}

function Body({ circuit }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 1 || n > MAX_QUBITS) return null;
    return interactionGraph(circuit);
  }, [collapsed, n, circuit]);

  if (n === 0) return <div className="panel__placeholder">place some gates to see qubit connectivity</div>;
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the interaction graph is capped at {MAX_QUBITS}.</div>;
  }
  if (!result) return null;
  if (result.totalEdges === 0) {
    return <div className="panel__placeholder">no multi-qubit gates — every qubit is isolated.</div>;
  }

  return <Graph weight={result.weight} maxWeight={result.maxWeight} totalEdges={result.totalEdges} n={n} />;
}

function Graph({
  weight,
  maxWeight,
  totalEdges,
  n,
}: {
  weight: number[][];
  maxWeight: number;
  totalEdges: number;
  n: number;
}) {
  const positions = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    const margin = 18;
    const cx = SIZE / 2, cy = SIZE / 2;
    const r = SIZE / 2 - margin;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      out.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    return out;
  }, [n]);

  const edges: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (weight[i][j] > 0) edges.push([i, j, weight[i][j]]);
    }
  }
  const radius = Math.max(4, Math.min(9, SIZE / (n * 1.2)));

  return (
    <div className="intgraph">
      <div className="intgraph__stats">
        <span><b>{edges.length}</b> distinct pairs</span>
        <span><b>{totalEdges}</b> interactions</span>
        <span>max <b>{maxWeight}</b>×</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="intgraph__svg plot-fill" role="img">
        <rect width={SIZE} height={SIZE} fill="var(--bg)" />
        {edges.map(([a, b, w], i) => (
          <line
            key={i}
            x1={positions[a].x}
            y1={positions[a].y}
            x2={positions[b].x}
            y2={positions[b].y}
            className="intgraph__edge"
            strokeWidth={1 + (w / maxWeight) * 4}
            strokeOpacity={0.35 + 0.65 * (w / maxWeight)}
          >
            <title>q{a} ↔ q{b}: {w} gate{w === 1 ? "" : "s"}</title>
          </line>
        ))}
        {positions.map((p, q) => (
          <g key={q}>
            <circle cx={p.x} cy={p.y} r={radius} className="intgraph__node" />
            <text x={p.x} y={p.y + 3} textAnchor="middle" className="intgraph__label">{q}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
