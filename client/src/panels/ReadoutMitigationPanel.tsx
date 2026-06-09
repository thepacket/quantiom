import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { simulate, type ParameterValues } from "../sim/simulate";
import { applyReadoutError, mitigateReadout } from "../sim/readoutMitigation";
import type { NoiseModel } from "../sim/noise";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

type Props = { circuit: Circuit; customGates: CustomGate[]; paramValues: ParameterValues; noise: NoiseModel };

const MAX_QUBITS = 8;
const TOP_K = 12;

/**
 * Readout-error mitigation. Takes the ideal output distribution, applies the
 * noise model's symmetric readout bit-flip to get the "measured" distribution,
 * then inverts the confusion matrix (`sim/readoutMitigation.ts`) to recover a
 * corrected estimate — shown as ideal vs measured vs corrected bars so you can
 * see the readout error and the mitigation undoing it. Needs the Noise panel
 * enabled; statevector path; default-collapsed.
 */
export function ReadoutMitigationPanel(props: Props) {
  return (
    <PanelShell id="readout-mitigation" title="Readout-error mitigation" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const n = circuit.numQubits;
  const p = noise.readoutBitFlip ?? 0;

  const result = useMemo(() => {
    if (collapsed || n < 1 || n > MAX_QUBITS) return null;
    const res = simulate(circuit, paramValues, customGates);
    if (res.isStabilizer) return null;
    const ideal = res.probabilities;
    const measured = applyReadoutError(ideal, n, p);
    const { corrected, clippedMass } = mitigateReadout(measured, n, p);
    // L1 distances to the ideal, before and after.
    const l1 = (a: number[]) => a.reduce((s, v, i) => s + Math.abs(v - ideal[i]), 0) / 2;
    return { ideal, measured, corrected, clippedMass, errBefore: l1(measured), errAfter: l1(corrected) };
  }, [collapsed, circuit, customGates, paramValues, n, p]);

  if (n < 1) return <div className="panel__placeholder">place some gates first</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — capped at {MAX_QUBITS}.</div>;
  if (!noise.enabled) return <div className="panel__notice">Enable the Noise panel to mitigate readout error.</div>;
  if (p <= 0) return <div className="panel__notice">Set a non-zero readout bit-flip in the Noise panel.</div>;
  if (!result) return null;

  // Top basis states by ideal probability.
  const dim = 1 << n;
  const order = Array.from({ length: dim }, (_, i) => i)
    .sort((a, b) => result.ideal[b] - result.ideal[a])
    .slice(0, TOP_K);
  const labels = order.map((i) => i.toString(2).padStart(n, "0"));
  const W = 320, rowH = 16, padL = 56, padR = 8, padT = 6;
  const H = padT + order.length * rowH + 16;
  const barW = W - padL - padR;
  const series: { key: "ideal" | "measured" | "corrected"; color: string }[] = [
    { key: "ideal", color: "var(--accent-2)" },
    { key: "measured", color: "#ff9a5a" },
    { key: "corrected", color: "#7ed957" },
  ];

  return (
    <div className="cplot">
      <div className="romit__stats">
        readout p = {p.toFixed(3)} · error to ideal: <b style={{ color: "#ff9a5a" }}>{result.errBefore.toFixed(3)}</b> →{" "}
        <b style={{ color: "#7ed957" }}>{result.errAfter.toFixed(3)}</b>
        {result.clippedMass > 1e-6 ? ` · clipped ${result.clippedMass.toFixed(3)}` : ""}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cplot__svg plot-fill" role="img">
        {order.map((idx, r) => {
          const y = padT + r * rowH;
          return (
            <g key={idx}>
              <text x={padL - 4} y={y + rowH / 2 + 3} textAnchor="end" className="cplot__tick" style={{ fontFamily: "ui-monospace, monospace" }}>
                {labels[r]}
              </text>
              {series.map((s, si) => {
                const v = result[s.key][idx];
                const bh = (rowH - 3) / 3;
                return (
                  <rect key={s.key} x={padL} y={y + si * bh} width={Math.max(0, v * barW)} height={bh - 0.5} fill={s.color}>
                    <title>{s.key} |{labels[r]}⟩: {v.toFixed(4)}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="cplot__legend">
        <span><span className="cplot__swatch" style={{ background: "var(--accent-2)" }} /> ideal</span>
        <span><span className="cplot__swatch" style={{ background: "#ff9a5a" }} /> measured (noisy)</span>
        <span><span className="cplot__swatch" style={{ background: "#7ed957" }} /> corrected</span>
      </div>
    </div>
  );
}
