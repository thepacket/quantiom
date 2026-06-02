import { useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { estimateResources, type Resources } from "../sim/resources";
import type { Circuit } from "../editor/types";

type Tab = { id: string; name: string; circuit: Circuit };

type Props = {
  currentTabId: string;
  tabs: Tab[];
};

/**
 * Side-by-side metrics between the active tab (left column) and any other
 * tab the user picks (right column). Everything is derived from the IR via
 * estimateResources, plus the qubit/clbit counts and circuit name. The diff
 * column shows the delta in gate counts (other − active).
 */
export function ComparePanel({ currentTabId, tabs }: Props) {
  return (
    <PanelShell id="compare" title="Compare circuits" defaultCollapsed>
      <CompareBody currentTabId={currentTabId} tabs={tabs} />
    </PanelShell>
  );
}

function CompareBody({ currentTabId, tabs }: Props) {
  const collapsed = usePanelCollapsed();
  const current = tabs.find((t) => t.id === currentTabId);
  const others = tabs.filter((t) => t.id !== currentTabId);
  const [pickedId, setPickedId] = useState<string>("");

  const picked = useMemo(
    () => (pickedId ? tabs.find((t) => t.id === pickedId) : undefined),
    [pickedId, tabs],
  );

  const left = useMemo(
    () => (collapsed || !current ? null : estimateResources(current.circuit)),
    [collapsed, current],
  );
  const right = useMemo(
    () => (collapsed || !picked ? null : estimateResources(picked.circuit)),
    [collapsed, picked],
  );

  if (collapsed) return null;
  if (!current) return <div className="compare__empty">no active circuit</div>;
  if (others.length === 0) return <div className="compare__empty">open a second tab to compare</div>;
  if (!picked || !right || !left) {
    return (
      <div className="compare">
        <label className="compare__pick">
          <span>compare with</span>
          <select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
            <option value="">— pick a tab —</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || "Untitled"}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  const leftName = current.name || current.circuit.name || "left";
  const rightName = picked.name || picked.circuit.name || "right";
  return (
    <div className="compare">
      <label className="compare__pick">
        <span>compare with</span>
        <select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || "Untitled"}
            </option>
          ))}
        </select>
      </label>
      <table className="compare__table">
        <thead>
          <tr>
            <th />
            <th title={leftName}>{truncate(leftName, 14)}</th>
            <th title={rightName}>{truncate(rightName, 14)}</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          <Row label="qubits" l={current.circuit.numQubits} r={picked.circuit.numQubits} />
          <Row label="clbits" l={current.circuit.numClbits} r={picked.circuit.numClbits} />
          {METRIC_ROWS.map(({ label, key }) => (
            <Row key={key} label={label} l={left[key]} r={right[key]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRIC_ROWS: Array<{ label: string; key: keyof Resources }> = [
  { label: "total gates", key: "totalGates" },
  { label: "1-qubit", key: "oneQubit" },
  { label: "2-qubit", key: "twoQubit" },
  { label: "multi-qubit", key: "multiQubit" },
  { label: "measurements", key: "measurements" },
  { label: "parameterized", key: "parameterized" },
  { label: "CX count", key: "cxCount" },
  { label: "T-count", key: "tCount" },
  { label: "T-depth", key: "tDepth" },
  { label: "Clifford", key: "cliffordCount" },
  { label: "parallel depth", key: "parallelDepth" },
  { label: "longest qubit", key: "longestQubitLength" },
  { label: "qubits touched", key: "distinctQubits" },
  { label: "free symbols", key: "freeSymbols" },
];

function Row({ label, l, r }: { label: string; l: number; r: number }) {
  const d = r - l;
  const dClass = d > 0 ? "compare__delta compare__delta--up" : d < 0 ? "compare__delta compare__delta--down" : "compare__delta";
  return (
    <tr>
      <td className="compare__label">{label}</td>
      <td>{l}</td>
      <td>{r}</td>
      <td className={dClass}>{d > 0 ? `+${d}` : d}</td>
    </tr>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
