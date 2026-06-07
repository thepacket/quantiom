import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { pauliBudget } from "../sim/pauliBudget";
import type { NoiseModel } from "../sim/noise";
import type { Circuit } from "../editor/types";

type Props = { circuit: Circuit; noise: NoiseModel };

/**
 * Pauli error budget. Decomposes the noise model into each qubit's per-gate
 * X/Y/Z error probabilities (Pauli-twirl approximation) as stacked bars, with
 * a readout-error tick. Exact and instant — pure transparency over the
 * configured rates; needs the Noise panel enabled. Default-collapsed.
 */
export function PauliBudgetPanel({ circuit, noise }: Props) {
  return (
    <PanelShell id="pauli-budget" title="Pauli error budget" defaultCollapsed>
      <Body circuit={circuit} noise={noise} />
    </PanelShell>
  );
}

const PAULI_COLORS = { X: "#ff8e6f", Y: "#74d6a0", Z: "#6fb1ff" };

function Body({ circuit, noise }: Props) {
  const collapsed = usePanelCollapsed();
  const budget = useMemo(
    () => (collapsed ? null : pauliBudget(noise, circuit.numQubits)),
    [collapsed, noise, circuit.numQubits],
  );
  if (collapsed || !budget) return null;

  if (!noise.enabled) return <div className="pbudget__hint">Enable the Noise panel to see the per-qubit Pauli error budget.</div>;

  const n = budget.qubits.length;
  const maxTotal = Math.max(1e-4, ...budget.total);
  const cell = 28, labelB = 28, padT = 8, padR = 8, axisL = 6;
  const W = axisL + n * cell + padR;
  const H = 150;
  const plotH = H - padT - labelB;
  const yOf = (v: number) => padT + (1 - v / maxTotal) * plotH;
  const bw = Math.min(16, cell - 6);

  return (
    <div className="pbudget">
      <svg viewBox={`0 0 ${W} ${H}`} className="pbudget__svg plot-fill" role="img">
        <line x1={axisL} y1={padT} x2={axisL} y2={padT + plotH} className="pbudget__axis-line" />
        <line x1={axisL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="pbudget__axis-line" />
        {budget.qubits.map((q, i) => {
          const x = axisL + i * cell + (cell - bw) / 2;
          const segs: { p: keyof typeof PAULI_COLORS; v: number }[] = [
            { p: "Z", v: budget.pZ[i] },
            { p: "Y", v: budget.pY[i] },
            { p: "X", v: budget.pX[i] },
          ];
          let yCursor = padT + plotH;
          const rects = segs.map((s) => {
            const h = (s.v / maxTotal) * plotH;
            yCursor -= h;
            return (
              <rect key={s.p} x={x} y={yCursor} width={bw} height={h} fill={PAULI_COLORS[s.p]}>
                <title>q{q} {s.p}: {(s.v * 100).toFixed(3)}%</title>
              </rect>
            );
          });
          return (
            <g key={q}>
              {rects}
              {budget.readout[i] > 0 && (
                <line x1={x - 1} x2={x + bw + 1} y1={yOf(budget.readout[i])} y2={yOf(budget.readout[i])} stroke="#e8c46a" strokeWidth={1.4} strokeDasharray="2 1.5">
                  <title>q{q} readout: {(budget.readout[i] * 100).toFixed(2)}%</title>
                </line>
              )}
              <text x={x + bw / 2} y={padT + plotH + 11} textAnchor="middle" className="pbudget__axis">q{q}</text>
              <text x={x + bw / 2} y={padT + plotH + 21} textAnchor="middle" className="pbudget__tot">{(budget.total[i] * 100).toFixed(1)}%</text>
            </g>
          );
        })}
        <text x={axisL + 2} y={padT + 7} className="pbudget__axis">{(maxTotal * 100).toFixed(1)}%</text>
      </svg>
      <div className="pbudget__legend">
        <span className="pbudget__key" style={{ color: PAULI_COLORS.X }}>X</span>
        <span className="pbudget__key" style={{ color: PAULI_COLORS.Y }}>Y</span>
        <span className="pbudget__key" style={{ color: PAULI_COLORS.Z }}>Z</span>
        <span className="pbudget__key" style={{ color: "#e8c46a" }}>readout</span>
        — per-gate error (PTA)
      </div>
    </div>
  );
}
