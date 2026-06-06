import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { branchTree, type BranchNode, type BranchTreeResult, MAX_BRANCH_QUBITS } from "../sim/branchTree";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MEASURE_IDS = new Set(["measure", "measure_x", "measure_y", "reset"]);

/**
 * Dynamic branch tree: the probabilistic outcome tree a circuit traces through
 * its mid-circuit measurements and resets. Each node is a measurement event;
 * each edge an outcome (0/1) carrying its Born probability; each leaf a final
 * classical record with its cumulative probability. The dynamic-circuit
 * counterpart of the probability histogram. n ≤ 12, default-collapsed.
 */
export function BranchTreePanel(props: Props) {
  return (
    <PanelShell id="branch-tree" title="Dynamic branch tree" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;
  const hasMeasure = useMemo(() => circuit.gates.some((g) => MEASURE_IDS.has(g.gateId)), [circuit.gates]);

  const result = useMemo(() => {
    if (collapsed || n < 1 || n > MAX_BRANCH_QUBITS || !hasMeasure) return null;
    return branchTree(circuit, paramValues, customGates);
  }, [collapsed, n, hasMeasure, circuit, paramValues, customGates]);

  if (n === 0) return <div className="panel__placeholder">place some gates</div>;
  if (!hasMeasure)
    return <div className="panel__notice">No mid-circuit measurements or resets — the branch tree shows how measurement outcomes fork the state. Add a measure/reset gate.</div>;
  if (n > MAX_BRANCH_QUBITS)
    return <div className="panel__notice">{n} qubits — branch tree is capped at {MAX_BRANCH_QUBITS}.</div>;
  if (!result || result.events === 0) return <div className="panel__notice">No reachable measurement branches.</div>;

  return <Tree r={result} />;
}

type Positioned = { node: BranchNode; x: number; depth: number };

function layout(root: BranchNode): { nodes: Positioned[]; maxDepth: number; leafCount: number } {
  const nodes: Positioned[] = [];
  let leaf = 0;
  let maxDepth = 0;
  const visit = (node: BranchNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (node.children.length === 0) {
      x = leaf++;
    } else {
      const xs = node.children.map((c) => visit(c, depth + 1));
      x = xs.reduce((a, b) => a + b, 0) / xs.length;
    }
    nodes.push({ node, x, depth });
    return x;
  };
  visit(root, 0);
  return { nodes, maxDepth, leafCount: Math.max(1, leaf) };
}

const ROW_H = 46;
const PAD_X = 16;
const PAD_TOP = 12;

function Tree({ r }: { r: BranchTreeResult }) {
  const { nodes, maxDepth, leafCount } = useMemo(() => layout(r.root), [r]);
  const colW = Math.max(54, Math.min(120, 520 / leafCount));
  const W = PAD_X * 2 + Math.max(1, leafCount - 1) * colW + 80;
  const H = PAD_TOP * 2 + maxDepth * ROW_H + 30;
  const px = (x: number) => PAD_X + x * colW + 30;
  const py = (d: number) => PAD_TOP + d * ROW_H;

  const pos = new Map<BranchNode, Positioned>();
  for (const p of nodes) pos.set(p.node, p);

  return (
    <div className="bt">
      <div className="bt__stats">
        <span>{r.events} measurement{r.events === 1 ? "" : "s"}</span>
        <span>{r.numLeaves} branch{r.numLeaves === 1 ? "" : "es"}</span>
        {r.truncated && <span className="bt__trunc">truncated at cap</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bt__svg plot-fill" role="img">
        {/* edges */}
        {nodes.map(({ node }) =>
          node.children.map((c) => {
            const a = pos.get(node)!;
            const b = pos.get(c)!;
            const x1 = px(a.x), y1 = py(a.depth), x2 = px(b.x), y2 = py(b.depth);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            return (
              <g key={node.label + c.label + c.outcome + b.x}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className={`bt__edge${c.outcome === 1 ? " bt__edge--one" : ""}`} />
                <text x={mx} y={my - 2} textAnchor="middle" className="bt__edge-lbl">
                  {c.outcome}·{(c.edgeProb * 100).toFixed(0)}%
                </text>
              </g>
            );
          }),
        )}
        {/* nodes */}
        {nodes.map(({ node, x, depth }) => {
          const cx = px(x), cy = py(depth);
          const isLeaf = node.children.length === 0;
          return (
            <g key={`n${depth}-${x}-${node.label}`}>
              <circle cx={cx} cy={cy} r={isLeaf ? 4 : 5} className={isLeaf ? "bt__leaf" : "bt__node"} />
              {!isLeaf && node.label !== "root" && (
                <text x={cx + 8} y={cy + 3} className="bt__node-lbl">{node.label}</text>
              )}
              {node.label === "root" && <text x={cx + 8} y={cy + 3} className="bt__node-lbl">start</text>}
              {isLeaf && (
                <text x={cx} y={cy + 16} textAnchor="middle" className="bt__leaf-lbl">
                  c={node.bits} · {(node.prob * 100).toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="bt__legend">edge = outcome·P(outcome | branch) · leaf = classical record · cumulative P</div>
    </div>
  );
}
