import { useEffect, useMemo, useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { simulateNoisy } from "../sim/simulateNoisy";
import { coherentInformation, type CoherentInfoResult } from "../sim/coherentInformation";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  noise: NoiseModel;
};
const MAX_QUBITS = 6;

/**
 * Coherent information I_c(A⟩B) = S(ρ_B) − S(ρ) for the noisy state ρ — a
 * lower bound on one-way distillable entanglement and the quantum-channel
 * capacity. **Positive** I_c certifies that quantum information survives
 * across the A|B cut; it goes negative once decoherence has destroyed the
 * quantum correlations. Reads the trajectory-averaged ρ; requires noise mode,
 * n ≤ 6, default-collapsed.
 */
export function CoherentInfoPanel({ circuit, customGates, paramValues, noise }: Props) {
  return (
    <PanelShell id="coherent-information" title="Coherent information" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;
  const [inA, setInA] = useState<boolean[]>([]);

  useEffect(() => {
    setInA((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<boolean>(n).fill(false);
      for (let i = 0; i < Math.floor(n / 2); i++) next[i] = true;
      return next;
    });
  }, [n]);

  const subsetA = useMemo(() => inA.flatMap((on, i) => (on ? [i] : [])), [inA]);

  const result = useMemo(() => {
    if (collapsed || !noise.enabled) return null;
    if (n < 2 || n > MAX_QUBITS || subsetA.length === 0 || subsetA.length >= n) return null;
    const res = simulateNoisy(circuit, paramValues, customGates, noise, { density: true });
    if (!res.densityMatrix) return null;
    return coherentInformation(res.densityMatrix, n, subsetA, MAX_QUBITS);
  }, [collapsed, n, subsetA, circuit, customGates, paramValues, noise]);

  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (!noise.enabled)
    return <div className="panel__notice">Turn on the noise model — coherent information is a property of the mixed (noisy) state ρ; a pure state always gives I_c = S(ρ_B).</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS} (builds the full ρ).</div>;

  const toggle = (q: number) => setInA((prev) => prev.map((v, i) => (i === q ? !v : v)));
  return (
    <div className="cohinfo">
      <div className="cohinfo__cut">
        <span className="cohinfo__cut-label">subsystem A:</span>
        {Array.from({ length: n }, (_, q) => (
          <label key={q} className={"cohinfo__qubit" + (inA[q] ? " cohinfo__qubit--on" : "")}>
            <input type="checkbox" checked={inA[q] ?? false} onChange={() => toggle(q)} />q{q}
          </label>
        ))}
      </div>
      {subsetA.length === 0 || subsetA.length >= n ? (
        <div className="panel__placeholder">select a proper subset A (B is the rest).</div>
      ) : result ? (
        <View r={result} />
      ) : null}
    </div>
  );
}

function View({ r }: { r: CoherentInfoResult }) {
  const positive = r.coherentInfo > 1e-6;
  return (
    <div className="cohinfo__out">
      <div className={"cohinfo__hero " + (positive ? "cohinfo__hero--ok" : "cohinfo__hero--no")}>
        I_c(A⟩B) = <b>{r.coherentInfo.toFixed(4)}</b> bit
        <span className="cohinfo__tag">{positive ? "quantum info survives" : "no distillable coherence"}</span>
      </div>
      <div className="cohinfo__stats">
        <span>S(ρ_B) = <b>{r.sB.toFixed(3)}</b></span>
        <span>S(ρ) = <b>{r.sFull.toFixed(3)}</b></span>
      </div>
      <div className="cohinfo__legend">I_c = S(ρ_B) − S(ρ) · positive ⇒ a lower bound on one-way distillable entanglement / channel capacity</div>
    </div>
  );
}
