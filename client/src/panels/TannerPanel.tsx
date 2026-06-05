import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { tannerGraph } from "../sim/tanner";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };

/**
 * Tanner / check-connectivity graph. The bipartite graph a decoder
 * consumes: round (data) qubits along the top, measurement checks along
 * the bottom, an edge wherever a qubit lies in that measurement's causal
 * support (the backward light cone of the measured qubit). A repetition
 * code shows weight-2 checks; a surface-code plaquette shows weight-4
 * checks. Purely structural — reuses the causal-cone computation, no
 * simulation. Default-collapsed.
 */
export function TannerPanel({ circuit }: Props) {
  return (
    <PanelShell id="tanner" title="Tanner / check graph" defaultCollapsed>
      <Body circuit={circuit} />
    </PanelShell>
  );
}

function Body({ circuit }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 1) return null;
    return tannerGraph(circuit);
  }, [collapsed, n, circuit]);

  if (n === 0) return <div className="panel__placeholder">place some gates to see the check graph</div>;
  if (!result) return null;
  if (result.checks.length === 0) {
    return <div className="panel__notice">no measurements — add measurement gates to see the stabilizer/check connectivity.</div>;
  }
  return <Graph checks={result.checks} n={n} />;
}

const PAD = 26;
const ROW_GAP = 90;
const NODE_R = 7;

function Graph({ checks, n }: { checks: ReturnType<typeof tannerGraph>["checks"]; n: number }) {
  const m = checks.length;
  const cols = Math.max(n, m);
  const cellW = Math.max(26, Math.min(46, 300 / cols));
  const W = PAD * 2 + (cols - 1) * cellW;
  const H = PAD * 2 + ROW_GAP;

  const dataX = (q: number) => PAD + q * cellW + (cols - n) * cellW / 2;
  const checkX = (k: number) => PAD + k * cellW + (cols - m) * cellW / 2;
  const dataY = PAD;
  const checkY = PAD + ROW_GAP;

  return (
    <div className="tanner">
      <div className="tanner__stats">
        <span><b>{n}</b> data</span>
        <span><b>{m}</b> checks</span>
        <span>max weight <b>{Math.max(...checks.map((c) => c.support.length))}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="tanner__svg plot-fill" role="img">
        {/* edges */}
        {checks.map((c, k) =>
          c.support.map((q) => (
            <line key={`e-${k}-${q}`} x1={checkX(k)} y1={checkY} x2={dataX(q)} y2={dataY} className="tanner__edge" />
          )),
        )}
        {/* data qubit nodes */}
        {Array.from({ length: n }, (_, q) => (
          <g key={`d-${q}`}>
            <circle cx={dataX(q)} cy={dataY} r={NODE_R} className="tanner__data" />
            <text x={dataX(q)} y={dataY - NODE_R - 3} textAnchor="middle" className="tanner__label">q{q}</text>
          </g>
        ))}
        {/* check nodes (squares) */}
        {checks.map((c, k) => (
          <g key={`c-${k}`}>
            <rect x={checkX(k) - NODE_R} y={checkY - NODE_R} width={NODE_R * 2} height={NODE_R * 2} className="tanner__check">
              <title>{c.label}: support {`{${c.support.join(",")}}`}</title>
            </rect>
            <text x={checkX(k)} y={checkY + NODE_R + 10} textAnchor="middle" className="tanner__label">{c.label}</text>
          </g>
        ))}
      </svg>
      <div className="tanner__legend">
        <span><span className="tanner__swatch tanner__swatch--data" /> data qubit</span>
        <span><span className="tanner__swatch tanner__swatch--check" /> check (measurement)</span>
      </div>
    </div>
  );
}
