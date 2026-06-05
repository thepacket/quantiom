import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { zxDiagram } from "../sim/zx";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };

const MAX_QUBITS = 12;
const MAX_COLS = 60;

/**
 * ZX-calculus diagram of the circuit: green Z-spiders, red X-spiders,
 * yellow Hadamard boxes, plain wires, and dashed Hadamard edges (CZ), laid
 * out on the circuit's qubit×column grid. Phase labels sit beside the
 * spiders. Reveals the circuit's Clifford skeleton and where the
 * non-Clifford phases (π/4 spiders) live.
 *
 * This is faithful diagram rendering — not ZX rewriting / T-count
 * reduction (a separate research effort). Purely structural,
 * default-collapsed.
 */
export function ZXPanel({ circuit }: Props) {
  return (
    <PanelShell id="zx" title="ZX diagram" defaultCollapsed>
      <Body circuit={circuit} />
    </PanelShell>
  );
}

function Body({ circuit }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 1 || n > MAX_QUBITS) return null;
    return zxDiagram(circuit);
  }, [collapsed, n, circuit]);

  if (n === 0) return <div className="panel__placeholder">place some gates to see the ZX diagram</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — the ZX diagram is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  if (result.numCols > MAX_COLS) return <div className="panel__notice">{result.numCols} columns — the ZX diagram is capped at {MAX_COLS}.</div>;
  if (result.nodes.length === 0) return <div className="panel__placeholder">no spider-mapped gates yet.</div>;

  return <Diagram result={result} n={n} />;
}

const LABEL_W = 18;
const ROW_H = 30;
const COL_W = 30;
const PAD = 14;
const RAD = 6;

function Diagram({ result, n }: { result: ReturnType<typeof zxDiagram>; n: number }) {
  const { nodes, edges, numCols, fusableHint } = result;
  const W = LABEL_W + PAD + numCols * COL_W;
  const H = n * ROW_H + 8;
  const yOf = (q: number) => q * ROW_H + ROW_H / 2;
  const xOf = (c: number) => LABEL_W + PAD + c * COL_W + COL_W / 2;

  return (
    <div className="zx">
      <div className="zx__stats">
        <span><b>{nodes.length}</b> nodes</span>
        <span><b>{edges.length}</b> edges</span>
        {fusableHint > 0 && <span><b>{fusableHint}</b> fusable spider pair{fusableHint === 1 ? "" : "s"}</span>}
      </div>
      <div className="zx__scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="zx__svg plot-fill" role="img">
          {/* qubit wires */}
          {Array.from({ length: n }, (_, q) => (
            <g key={`w-${q}`}>
              <line x1={LABEL_W} y1={yOf(q)} x2={W} y2={yOf(q)} className="zx__wire" />
              <text x={LABEL_W - 4} y={yOf(q) + 3} textAnchor="end" className="zx__label">q{q}</text>
            </g>
          ))}
          {/* vertical 2-qubit edges */}
          {edges.map((e, i) => (
            <line
              key={`e-${i}`}
              x1={xOf(e.col)} y1={yOf(e.q1)} x2={xOf(e.col)} y2={yOf(e.q2)}
              className={e.hadamard ? "zx__hedge" : "zx__edge"}
            />
          ))}
          {/* nodes */}
          {nodes.map((nd) => {
            const x = xOf(nd.col), y = yOf(nd.qubit);
            if (nd.kind === "H") {
              return (
                <g key={nd.id}>
                  <rect x={x - 5} y={y - 5} width={10} height={10} className="zx__hbox" />
                  <text x={x} y={y + 3} textAnchor="middle" className="zx__hlabel">H</text>
                </g>
              );
            }
            if (nd.kind === "box") {
              return (
                <g key={nd.id}>
                  <rect x={x - 9} y={y - 7} width={18} height={14} rx={2} className="zx__box" />
                  <text x={x} y={y + 3} textAnchor="middle" className="zx__boxlabel">{nd.label}</text>
                </g>
              );
            }
            const cls = nd.kind === "Z" ? "zx__z" : "zx__x";
            return (
              <g key={nd.id}>
                <circle cx={x} cy={y} r={RAD} className={cls} />
                {nd.phase && <text x={x} y={y - RAD - 2} textAnchor="middle" className="zx__phase">{nd.phase}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="zx__legend">
        <span><span className="zx__swatch zx__swatch--z" /> Z (green)</span>
        <span><span className="zx__swatch zx__swatch--x" /> X (red)</span>
        <span><span className="zx__swatch zx__swatch--h" /> H</span>
        <span><span className="zx__swatch zx__swatch--hedge" /> CZ (H-edge)</span>
      </div>
    </div>
  );
}
