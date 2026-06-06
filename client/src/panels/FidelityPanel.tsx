import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { noiseImpact, MAX_NOISE_IMPACT_QUBITS, type NoiseImpact } from "../sim/noiseImpact";
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

/**
 * Noise impact: how far the trajectory-averaged state ρ has drifted from the
 * noiseless pure state ψ. Reports fidelity F = ⟨ψ|ρ|ψ⟩ and trace distance to
 * the ideal, plus the state's own purity Tr(ρ²) and von Neumann entropy. The
 * one-glance "what is noise costing me?" panel — companion to Decoherence.
 * Noise-mode only, default-collapsed, capped at 6 qubits.
 */
export function FidelityPanel(props: Props) {
  return (
    <PanelShell id="fidelity" title="Fidelity & purity" defaultCollapsed unverified>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;

  const result = useMemo(() => {
    if (collapsed || !noise.enabled || n < 1 || n > MAX_NOISE_IMPACT_QUBITS) return null;
    return noiseImpact(circuit, paramValues, customGates, noise);
  }, [collapsed, circuit, paramValues, customGates, noise, n]);

  if (n === 0) return <div className="panel__placeholder">place some gates</div>;
  if (n > MAX_NOISE_IMPACT_QUBITS) {
    return <div className="panel__notice">{n} qubits — fidelity is capped at {MAX_NOISE_IMPACT_QUBITS} (dense ρ).</div>;
  }
  if (!noise.enabled) {
    return <div className="panel__notice">Enable the noise model to measure how far the state drifts from the ideal.</div>;
  }
  if (!result) return null;

  return <Metrics r={result} />;
}

function Gauge({ label, value, text, frac, hue, marker }: {
  label: string; value: number; text: string; frac: number; hue: string; marker?: number;
}) {
  void value;
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div className="fid__row">
      <div className="fid__head"><span className="fid__label">{label}</span><span className="fid__val">{text}</span></div>
      <div className="fid__bar">
        <div className="fid__fill" style={{ width: `${pct}%`, background: hue }} />
        {marker !== undefined && <div className="fid__marker" style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />}
      </div>
    </div>
  );
}

function Metrics({ r }: { r: NoiseImpact }) {
  const dim = 1 << r.numQubits;
  const uniformPurity = 1 / dim;
  return (
    <div className="fid">
      <Gauge label="Fidelity to ideal" value={r.fidelity} text={r.fidelity.toFixed(4)} frac={r.fidelity} hue="#3fb950" />
      <Gauge label="Trace distance" value={r.traceDistance} text={r.traceDistance.toFixed(4)} frac={r.traceDistance} hue="#f0883e" />
      <Gauge
        label="Purity Tr(ρ²)"
        value={r.purity}
        text={`${r.purity.toFixed(4)} (mixed = ${uniformPurity.toFixed(3)})`}
        frac={(r.purity - uniformPurity) / (1 - uniformPurity)}
        hue="#7ee0ff"
        marker={0}
      />
      <Gauge
        label="Entropy S(ρ)"
        value={r.entropy}
        text={`${r.entropy.toFixed(3)} / ${r.numQubits} bit`}
        frac={r.entropy / r.numQubits}
        hue="#c98aff"
      />
      <div className="fid__note">vs the noiseless state · F=1, S=0 when noise is off</div>
    </div>
  );
}
