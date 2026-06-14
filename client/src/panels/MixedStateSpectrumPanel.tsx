import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { simulateNoisy } from "../sim/simulateNoisy";
import { densitySpectrum, type MixedSpectrumResult } from "../sim/mixedStateSpectrum";
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
 * Mixed-state spectrum — the eigenvalues of the trajectory-averaged output
 * density matrix ρ under the noise model. A noiseless channel gives a pure
 * output ({1, 0, …}); decoherence spreads the weight, and the effective rank
 * 1/Σp² counts how many components contribute (how far the output is from
 * pure). Reports the spectrum, purity, effective rank, and S(ρ). Requires
 * noise mode; n ≤ 6, default-collapsed.
 */
export function MixedStateSpectrumPanel({ circuit, customGates, paramValues, noise }: Props) {
  return (
    <PanelShell id="mixed-state-spectrum" title="Mixed-state spectrum" defaultCollapsed>
      <Body circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || !noise.enabled) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    const res = simulateNoisy(circuit, paramValues, customGates, noise, { density: true });
    if (!res.densityMatrix) return null;
    return densitySpectrum(res.densityMatrix, 1 << n);
  }, [collapsed, n, circuit, customGates, paramValues, noise]);

  if (n < 1) return <div className="panel__placeholder">build a circuit</div>;
  if (!noise.enabled)
    return <div className="panel__notice">Turn on the noise model — this panel shows the eigenvalue spectrum of the noisy output ρ (a unitary circuit gives a trivial pure spectrum).</div>;
  if (n > MAX_QUBITS)
    return <div className="panel__notice">{n} qubits — the mixed-state spectrum is capped at {MAX_QUBITS}.</div>;
  if (!result) return null;
  return <View r={result} />;
}

const W = 300;
const H = 100;
const MAX_BARS = 32;

function View({ r }: { r: MixedSpectrumResult }) {
  const bars = r.spectrum.slice(0, MAX_BARS);
  const max = bars[0] || 1;
  const bw = Math.max(3, Math.floor((W - 2) / bars.length) - 1);
  return (
    <div className="mss__out">
      <div className="mss__stats">
        <span>purity = <b>{r.purity.toFixed(3)}</b></span>
        <span>eff. rank = <b>{r.effectiveRank.toFixed(2)}</b></span>
        <span>S(ρ) = <b>{r.entropy.toFixed(3)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mss__svg plot-fill" role="img">
        <line x1={0} y1={H - 12} x2={W} y2={H - 12} className="mss__axis-line" />
        {bars.map((p, k) => {
          const h = (p / max) * (H - 16);
          const x = 1 + k * (bw + 1);
          return <rect key={k} x={x} y={H - 12 - h} width={bw} height={h} className="mss__bar"><title>p[{k}] = {p.toFixed(4)}</title></rect>;
        })}
      </svg>
      <div className="mss__legend">eigenvalues of the noisy output ρ · purity 1 / eff. rank 1 ⇒ still pure (unitary)</div>
    </div>
  );
}
