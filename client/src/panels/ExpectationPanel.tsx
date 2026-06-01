import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { paulis as evalPaulis, type Pauli } from "../sim/expectation";

type Props = { state: SimState };

const PAULIS: Pauli[] = ["I", "X", "Y", "Z"];

export function ExpectationPanel({ state }: Props) {
  // Compute the copy text outside the body so PanelShell's toolbar can use it.
  // Light cost; the body's heavy memo skips when collapsed.
  return (
    <PanelShell id="expectation" title="Expectation ⟨P⟩" getCopyText={() => "(open panel to compute)"}>
      <ExpectationBody state={state} />
    </PanelShell>
  );
}

function ExpectationBody({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [selection, setSelection] = useState<Pauli[]>([]);

  // Resize per-qubit Pauli selection when the circuit width changes.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<Pauli>(n).fill("I");
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [n]);

  // O(n · 2^n) inner-product walk over the state. Skip while the panel
  // is hidden — that's the whole point of this guard.
  const value = useMemo(() => {
    if (collapsed) return null;
    if (!data || selection.length !== n) return null;
    return evalPaulis(data.state, n, selection);
  }, [data, selection, n, collapsed]);

  const opLabel = useMemo(() => {
    const parts: string[] = [];
    for (let q = 0; q < selection.length; q++) {
      if (selection[q] !== "I") parts.push(`${selection[q]}${sub(q)}`);
    }
    return parts.length ? parts.join(" ") : "I";
  }, [selection]);

  const setQubit = (q: number, p: Pauli) => {
    setSelection((prev) => {
      const next = [...prev];
      next[q] = p;
      return next;
    });
  };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isNoisy) {
    return (
      <div className="panel__notice">
        Noise mode on — ⟨P⟩ from a single trajectory is biased. Trajectory-
        averaged expectation values are on the follow-up list; for now, the
        Bloch panel (which is trajectory-averaged) gives single-qubit Pauli
        expectations.
      </div>
    );
  }

  return (
    <div className="exp">
      <div className="exp__row">
        {selection.map((p, q) => (
          <div key={q} className="exp__cell">
            <span className="exp__qubit">q{q}</span>
            <select className="exp__pauli" value={p} onChange={(e) => setQubit(q, e.target.value as Pauli)}>
              {PAULIS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="exp__result">
        <span className="exp__op">⟨{opLabel}⟩</span>
        <span className="exp__value">{value === null ? "—" : value.toFixed(4)}</span>
      </div>
    </div>
  );
}

function sub(n: number): string {
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return n
    .toString()
    .split("")
    .map((d) => digits[parseInt(d, 10)])
    .join("");
}
