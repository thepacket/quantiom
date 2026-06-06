import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import {
  coherenceFromAmplitudes,
  coherenceFromDensity,
  type CoherenceResult,
} from "../sim/coherence";
import { simulateNoisy } from "../sim/simulateNoisy";
import type { Complex } from "../sim/density";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";

type Props = {
  state: SimState;
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  noise: NoiseModel;
};

const MAX_PURE_QUBITS = 16;
const MAX_MIXED_QUBITS = 6;

/**
 * Coherence (computational basis): the l₁-norm of coherence Σ_{i≠j}|ρ_ij| and
 * the relative entropy of coherence S(ρ_diag) − S(ρ). Both measure how much
 * superposition lives off the diagonal — the resource that powers
 * interference, and exactly what decoherence destroys. Pure mode reads the
 * statevector (n ≤ 16); noise mode reads the trajectory-averaged ρ (n ≤ 6) so
 * you watch coherence decay. Default-collapsed.
 */
export function CoherencePanel(props: Props) {
  return (
    <PanelShell id="coherence" title="Coherence" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ state, circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = circuit.numQubits;
  const noisy = noise.enabled === true;

  const result = useMemo<CoherenceResult | null>(() => {
    if (collapsed || n < 1) return null;
    if (noisy) {
      if (n > MAX_MIXED_QUBITS) return null;
      const res = simulateNoisy(circuit, paramValues, customGates, noise, { density: true });
      const buf = res.densityMatrix;
      if (!buf) return null;
      const dim = 1 << n;
      const rho: Complex[][] = Array.from({ length: dim }, () => new Array<Complex>(dim));
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++) {
          const o = 2 * (i * dim + j);
          rho[i][j] = { re: buf[o], im: buf[o + 1] };
        }
      return coherenceFromDensity(rho, n);
    }
    if (!data || data.isStabilizer || n > MAX_PURE_QUBITS) return null;
    return coherenceFromAmplitudes(data.state, n);
  }, [collapsed, n, noisy, circuit, paramValues, customGates, noise, data]);

  if (n === 0) return <div className="panel__placeholder">place some gates</div>;
  if (!noisy && data?.isStabilizer)
    return <div className="panel__notice">Clifford fast path — switch off Clifford mode to read the amplitudes.</div>;
  if (noisy && n > MAX_MIXED_QUBITS)
    return <div className="panel__notice">{n} qubits — mixed-state coherence is capped at {MAX_MIXED_QUBITS} (dense ρ).</div>;
  if (!noisy && n > MAX_PURE_QUBITS)
    return <div className="panel__notice">{n} qubits — coherence is capped at {MAX_PURE_QUBITS}.</div>;
  if (!result) return null;

  return <Metrics r={result} noisy={noisy} />;
}

function Bar({ label, text, frac, sub }: { label: string; text: string; frac: number; sub: string }) {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div className="coh__row">
      <div className="coh__head">
        <span className="coh__label">{label}</span>
        <span className="coh__val">{text}</span>
      </div>
      <div className="coh__bar"><div className="coh__fill" style={{ width: `${pct}%` }} /></div>
      <div className="coh__sub">{sub}</div>
    </div>
  );
}

function Metrics({ r, noisy }: { r: CoherenceResult; noisy: boolean }) {
  return (
    <div className="coh">
      <Bar
        label="l₁ coherence"
        text={r.cL1.toFixed(3)}
        frac={r.cL1Max > 0 ? r.cL1 / r.cL1Max : 0}
        sub={`of max ${r.cL1Max} · ${((r.cL1Max > 0 ? r.cL1 / r.cL1Max : 0) * 100).toFixed(0)}%`}
      />
      <Bar
        label="rel-entropy coherence"
        text={`${r.cRel.toFixed(3)} bit`}
        frac={r.cRelMax > 0 ? r.cRel / r.cRelMax : 0}
        sub={`of max ${r.cRelMax} bit`}
      />
      {noisy && (
        <div className="coh__note">mixed ρ · S(ρ) = {r.stateEntropy.toFixed(3)} bit — coherence below the pure-state value is the part noise has destroyed</div>
      )}
    </div>
  );
}
