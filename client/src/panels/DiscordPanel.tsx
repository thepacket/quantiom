import { useMemo } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { quantumDiscordMap, MAX_DISCORD_QUBITS, type DiscordResult } from "../sim/quantumDiscord";

type Props = { state: SimState };

/**
 * Pairwise quantum discord D(A|B) — quantum correlations beyond entanglement.
 * D = I(A:B) − J(A:B), where J is the most information a projective measurement
 * on B reveals about A (minimised over the measurement axis). D > 0 even for
 * some separable states, so it catches non-classical correlation that
 * concurrence / negativity miss. Asymmetric heatmap (row = A, measured = B).
 * Statevector path, n ≤ 8, default-collapsed.
 */
export function DiscordPanel({ state }: Props) {
  return (
    <PanelShell id="discord" title="Quantum discord" defaultCollapsed>
      <Body state={state} />
    </PanelShell>
  );
}

function Body({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;

  const result = useMemo(() => {
    if (collapsed || !data || data.isStabilizer || data.isNoisy) return null;
    if (n < 2 || n > MAX_DISCORD_QUBITS) return null;
    return quantumDiscordMap(data.state, n);
  }, [collapsed, data, n]);

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n < 2) return <div className="panel__placeholder">needs at least 2 qubits</div>;
  if (data.isStabilizer) return <div className="panel__notice">Clifford fast path — needs statevector reduced states.</div>;
  if (data.isNoisy) return <div className="panel__notice">Noise mode on — single-trajectory discord isn't meaningful.</div>;
  if (n > MAX_DISCORD_QUBITS) return <div className="panel__notice">{n} qubits — discord is capped at {MAX_DISCORD_QUBITS} (measurement optimisation per pair).</div>;
  if (!result) return null;
  return <Heat r={result} />;
}

const SIZE = 220;

function Heat({ r }: { r: DiscordResult }) {
  const { d, numQubits: n, max } = r;
  const cell = SIZE / n;
  const norm = Math.max(max, 1e-9);
  return (
    <div className="discord__out">
      <div className="discord__stats">
        <span>max D = <b>{max.toFixed(3)}</b> bit</span>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="discord__svg plot-fill" role="img">
        {d.map((row, a) =>
          row.map((v, b) => {
            if (a === b) return <rect key={`${a}-${b}`} x={b * cell} y={a * cell} width={cell + 0.5} height={cell + 0.5} className="discord__diag" />;
            return (
              <rect key={`${a}-${b}`} x={b * cell} y={a * cell} width={cell + 0.5} height={cell + 0.5}
                fill={`rgba(150, 120, 255, ${(0.06 + 0.9 * (v / norm)).toFixed(3)})`}>
                <title>D(q{a} | q{b} measured) = {v.toFixed(4)} bit</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="discord__legend">D(A | B) — row A, column = measured qubit B · quantum correlation beyond entanglement</div>
    </div>
  );
}
