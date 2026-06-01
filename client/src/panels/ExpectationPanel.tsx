import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell } from "./PanelShell";
import { paulis as evalPaulis, type Pauli } from "../sim/expectation";

type Props = { state: SimState };

const PAULIS: Pauli[] = ["I", "X", "Y", "Z"];

export function ExpectationPanel({ state }: Props) {
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [selection, setSelection] = useState<Pauli[]>([]);

  // Reset/resize the per-qubit Pauli selection when the circuit width changes.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<Pauli>(n).fill("I");
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [n]);

  const value = useMemo(() => {
    if (!data || selection.length !== n) return null;
    return evalPaulis(data.state, n, selection);
  }, [data, selection, n]);

  const opLabel = useMemo(() => {
    if (selection.length === 0) return "I";
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

  const copy = () => {
    if (value === null) return "";
    return `⟨${opLabel}⟩ = ${value.toFixed(6)}`;
  };

  return (
    <PanelShell id="expectation" title="Expectation ⟨P⟩" getCopyText={copy}>
      {!data ? (
        <div className="panel__placeholder">building circuit…</div>
      ) : n === 0 ? null : (
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
      )}
    </PanelShell>
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
