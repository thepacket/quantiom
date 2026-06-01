import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { estimateResources } from "../sim/resources";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit };

/**
 * Resource estimation. Pure derived from the IR, so it doesn't depend on
 * sim results — bumps even when the simulator is disabled or stuck.
 */
export function ResourcePanel({ circuit }: Props) {
  return (
    <PanelShell id="resources" title="Resources" defaultCollapsed>
      <ResourceBody circuit={circuit} />
    </PanelShell>
  );
}

function ResourceBody({ circuit }: Props) {
  const collapsed = usePanelCollapsed();
  const r = useMemo(() => (collapsed ? null : estimateResources(circuit)), [circuit, collapsed]);
  if (!r) return null;
  const tFraction = r.totalGates > 0 ? (r.tCount / r.totalGates) * 100 : 0;
  const isClifford = r.totalGates > 0 && r.tCount === 0 && r.parameterized === 0;
  return (
    <div className="resources">
      <div className="resources__row resources__row--hero">
        <span>{r.totalGates}</span><label>gates total</label>
      </div>
      <div className="resources__grid">
        <Cell label="1-qubit" value={r.oneQubit} />
        <Cell label="2-qubit" value={r.twoQubit} />
        <Cell label="multi-qubit" value={r.multiQubit} />
        <Cell label="measurements" value={r.measurements} />
        <Cell label="parameterized" value={r.parameterized} />
        <Cell label="parallel depth" value={r.parallelDepth} />
        <Cell label="longest qubit" value={r.longestQubitLength} />
        <Cell label="qubits touched" value={`${r.distinctQubits} / ${circuit.numQubits}`} />
        <Cell label="free symbols" value={r.freeSymbols} />
        <Cell
          label="T-count"
          value={r.tCount}
          hint={r.tCount > 0 ? `${tFraction.toFixed(1)}% of gates` : "no T gates"}
        />
      </div>
      {isClifford && (
        <div className="resources__note">
          Clifford-only — would route to the tableau path at n &gt; 16.
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="resources__cell">
      <span className="resources__value">{value}</span>
      <span className="resources__label">{label}</span>
      {hint && <span className="resources__hint">{hint}</span>}
    </div>
  );
}
