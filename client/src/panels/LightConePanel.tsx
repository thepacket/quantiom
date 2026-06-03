import { PanelShell } from "./PanelShell";

export type ConeDir = "backward" | "forward";

type Props = {
  numQubits: number;
  target: number | null;
  dir: ConeDir;
  onTarget: (q: number | null) => void;
  onDir: (d: ConeDir) => void;
};

/**
 * Causal light-cone explorer. Pick a target qubit and a direction; the
 * canvas dims every gate outside the cone, leaving the sub-circuit that
 * can causally influence (backward) — or be influenced by (forward) —
 * that qubit. A purely structural view: useful for seeing how deep a
 * measurement's dependency reaches, or which gates a fault could spread
 * to. The cone itself is computed in the editor (one pass over the gate
 * list); this panel just drives the selection.
 */
export function LightConePanel(props: Props) {
  return (
    <PanelShell id="light-cone" title="Causal cone" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ numQubits, target, dir, onTarget, onDir }: Props) {
  if (numQubits === 0) return <div className="panel__placeholder">no qubits</div>;
  return (
    <div className="lightcone">
      <div className="lightcone__dir">
        <button
          className={dir === "backward" ? "lightcone__dir-on" : ""}
          onClick={() => onDir("backward")}
          title="Gates that can influence this qubit's final state"
        >
          affects ←
        </button>
        <button
          className={dir === "forward" ? "lightcone__dir-on" : ""}
          onClick={() => onDir("forward")}
          title="Gates this qubit's input can influence"
        >
          → affected by
        </button>
      </div>
      <div className="lightcone__qubits">
        <span className="lightcone__label">qubit:</span>
        {Array.from({ length: numQubits }, (_, q) => (
          <button
            key={q}
            className={"lightcone__q" + (target === q ? " lightcone__q--on" : "")}
            onClick={() => onTarget(target === q ? null : q)}
          >
            q{q}
          </button>
        ))}
        {target !== null && (
          <button className="lightcone__clear" onClick={() => onTarget(null)}>clear</button>
        )}
      </div>
      {target === null && (
        <div className="panel__placeholder">pick a qubit to highlight its causal cone on the canvas.</div>
      )}
    </div>
  );
}
