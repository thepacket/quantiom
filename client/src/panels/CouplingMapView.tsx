import { useMemo } from "react";

type Props = { coupling: number[][]; size?: number };

/**
 * Mini visualisation of the imported coupling graph. Qubits are nodes,
 * edges are pairs that can interact with a 2-qubit gate. Layout:
 *   • ≤ 24 qubits — circular layout.
 *   • > 24 qubits — square grid (approximating IBM heavy-hex shape; not
 *     exact, but readable enough to spot connectivity holes).
 *
 * Edges drawn first, then qubit labels on top so they stay readable.
 */
export function CouplingMapView({ coupling, size = 200 }: Props) {
  const n = coupling.length;
  const positions = useMemo(() => layoutPositions(n, size), [n, size]);
  const edges = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let q = 0; q < n; q++) {
      for (const nb of coupling[q]) {
        if (nb > q) out.push([q, nb]);
      }
    }
    return out;
  }, [coupling, n]);
  const radius = Math.max(3, Math.min(8, size / (n * 1.2)));
  return (
    <svg width={size} height={size} className="coupling-svg">
      <rect width={size} height={size} fill="var(--bg)" />
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={positions[a].x}
          y1={positions[a].y}
          x2={positions[b].x}
          y2={positions[b].y}
          className="coupling-edge"
        />
      ))}
      {positions.map((p, q) => (
        <g key={q}>
          <circle cx={p.x} cy={p.y} r={radius} className="coupling-node" />
          {n <= 32 && (
            <text x={p.x} y={p.y + 3} textAnchor="middle" className="coupling-label">
              {q}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function layoutPositions(n: number, size: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const margin = 16;
  if (n <= 24) {
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - margin;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      out.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
  } else {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const dx = (size - 2 * margin) / Math.max(1, cols - 1);
    const dy = (size - 2 * margin) / Math.max(1, rows - 1);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      out.push({ x: margin + c * dx, y: margin + r * dy });
    }
  }
  return out;
}
