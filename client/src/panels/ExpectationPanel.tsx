import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { paulis as evalPaulis, type Pauli } from "../sim/expectation";
import { noisyPauliExpectation } from "../sim/simulateNoisy";
import type { NoiseModel } from "../sim/noise";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  state: SimState;
  /** Optional handles for re-running the simulator. When provided, the panel
   *  computes trajectory-averaged ⟨P⟩ in noise mode rather than displaying
   *  a single biased trajectory. */
  noisyContext?: {
    circuit: Circuit;
    paramValues: ParameterValues;
    customGates: CustomGate[];
    noise: NoiseModel;
  };
};

const PAULIS: Pauli[] = ["I", "X", "Y", "Z"];

export function ExpectationPanel({ state, noisyContext }: Props) {
  // Compute the copy text outside the body so PanelShell's toolbar can use it.
  // Light cost; the body's heavy memo skips when collapsed.
  return (
    <PanelShell id="expectation" title="Expectation ⟨P⟩" getCopyText={() => "(open panel to compute)"}>
      <ExpectationBody state={state} noisyContext={noisyContext} />
    </PanelShell>
  );
}

function ExpectationBody({ state, noisyContext }: Props) {
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
  // is hidden — that's the whole point of this guard. In noise mode, run
  // T trajectories and average rather than reading the biased single
  // representative trajectory.
  const value = useMemo(() => {
    if (collapsed) return null;
    if (!data || selection.length !== n) return null;
    if (data.isNoisy && noisyContext) {
      return noisyPauliExpectation(
        noisyContext.circuit,
        noisyContext.paramValues,
        noisyContext.customGates,
        noisyContext.noise,
        selection,
      );
    }
    if (data.isStabilizer) return null;
    return evalPaulis(data.state, n, selection);
  }, [data, selection, n, collapsed, noisyContext]);

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
  if (data.isStabilizer) {
    return (
      <div className="panel__notice">
        Clifford fast path — multi-qubit ⟨P⟩ via tableau measurement is
        on the follow-up list. Bloch panel gives single-qubit ⟨X/Y/Z⟩
        directly.
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
        {data.isNoisy && (
          <span className="exp__noisy-tag">avg of {data.trajectories} trajectories</span>
        )}
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
