import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { runClifford, isCliffordOnly } from "../sim/stabilizer";
import { mulberry32 } from "../sim/measure";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit; customGates: CustomGate[] };

const MAX_QUBITS = 24;

/**
 * Stabilizer generators ⟨g₁,…,gₙ⟩ of a Clifford circuit's state — the n Pauli
 * operators that fix it. Read straight from the Aaronson-Gottesman tableau, so
 * it works far past the statevector cap (up to the 1024-qubit Clifford limit;
 * the panel itself shows up to 24 for readability). Bell → +XX, +ZZ; GHZ →
 * +XX…X plus the ZZ-parity checks. Clifford-only; default-collapsed.
 */
export function StabilizerTableauPanel({ circuit, customGates }: Props) {
  return (
    <PanelShell id="stabilizer-tableau" title="Stabilizer generators" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} />
    </PanelShell>
  );
}

function Body({ circuit, customGates }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || n < 1) return null;
    const expanded = expandCustomGates(circuit.gates, customGates);
    if (!isCliffordOnly(expanded)) return { kind: "non-clifford" as const };
    if (n > MAX_QUBITS) return { kind: "too-big" as const };
    const { tab } = runClifford(n, expanded, mulberry32(0x9e3779b9), Math.max(1, circuit.numClbits));
    return { kind: "ok" as const, generators: tab.stabilizers() };
  }, [collapsed, circuit, customGates, n]);

  if (n === 0) return <div className="panel__placeholder">place some gates</div>;
  if (!result) return null;
  if (result.kind === "non-clifford") {
    return <div className="panel__notice">Clifford circuits only — uses H/S/√X/CNOT/CZ/SWAP/Pauli + measure/reset (no T, rotations, or arbitrary unitaries).</div>;
  }
  if (result.kind === "too-big") {
    return <div className="panel__notice">{n} qubits — the generator table is shown up to {MAX_QUBITS} (the tableau itself runs to 1024).</div>;
  }
  return <Generators rows={result.generators} />;
}

function Generators({ rows }: { rows: string[] }) {
  return (
    <div className="stab">
      <div className="stab__hint">The {rows.length} generators ⟨g₁…⟩ of the stabilizer group that fixes the state (qubit 0 leftmost).</div>
      <div className="stab__list">
        {rows.map((g, i) => {
          const sign = g[0];
          const paulis = g.slice(1);
          return (
            <div key={i} className="stab__gen">
              <span className="stab__idx">g<sub>{i + 1}</sub></span>
              <span className={"stab__sign" + (sign === "-" ? " stab__sign--neg" : "")}>{sign}</span>
              <span className="stab__paulis">
                {paulis.split("").map((p, q) => (
                  <span key={q} className={`stab__p stab__p--${p}`}>{p}</span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
