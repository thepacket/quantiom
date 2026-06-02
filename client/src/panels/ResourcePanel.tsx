import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { estimateResources } from "../sim/resources";
import { countConnectivityViolations } from "../sim/router";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit; coupling?: number[][] };

/**
 * Resource estimation. Pure derived from the IR, so it doesn't depend on
 * sim results — bumps even when the simulator is disabled or stuck.
 */
export function ResourcePanel({ circuit, coupling }: Props) {
  return (
    <PanelShell id="resources" title="Resources" defaultCollapsed>
      <ResourceBody circuit={circuit} coupling={coupling} />
    </PanelShell>
  );
}

function ResourceBody({ circuit, coupling }: Props) {
  const collapsed = usePanelCollapsed();
  const r = useMemo(() => (collapsed ? null : estimateResources(circuit)), [circuit, collapsed]);
  const violations = useMemo(
    () => (collapsed || !coupling ? null : countConnectivityViolations(circuit, coupling)),
    [circuit, coupling, collapsed],
  );
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
        <Cell label="T-depth" value={r.tDepth} hint={r.tDepth > 0 ? `magic-state rounds` : ""} />
        <Cell label="CX count" value={r.cxCount} />
      </div>
      {isClifford && (
        <div className="resources__note">
          Clifford-only — would route to the tableau path at n &gt; 16.
        </div>
      )}
      {r.arbitrary2q > 0 && (
        <div className="resources__note">
          {r.arbitrary2q} arbitrary 2q unitar{r.arbitrary2q === 1 ? "y" : "ies"} —
          KAK decomposition would add ≈ {r.arbitrary2q * 3} CX + {r.arbitrary2q * 8} 1-qubit gates.
        </div>
      )}
      {violations !== null && (
        <div className={"resources__note" + (violations > 0 ? " resources__note--warn" : "")}>
          {violations > 0
            ? `${violations} two-qubit gate${violations === 1 ? "" : "s"} violate the imported coupling map. Use "Route" to insert SWAPs.`
            : `All two-qubit gates fit the imported coupling map.`}
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
