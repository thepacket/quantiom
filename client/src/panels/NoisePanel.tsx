import { PanelShell } from "./PanelShell";
import type { NoiseModel } from "../sim/noise";

type Props = {
  noise: NoiseModel;
  onChange: (next: NoiseModel) => void;
};

/**
 * Noise model controls. Default-off; switching off restores the bare
 * statevector simulator with zero overhead. When on, the simulator runs
 * `trajectories` independent runs, injecting stochastic Pauli channels
 * after each gate and averaging the derived quantities.
 *
 * The Bloch and Probabilities panels reflect the averaged result; the
 * Statevector and Density panels show a notice (a single pure trajectory
 * is not the true mixed state).
 */
export function NoisePanel({ noise, onChange }: Props) {
  const set = (patch: Partial<NoiseModel>) => onChange({ ...noise, ...patch });
  const fmt = (v: number) =>
    v >= 0.01 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(4) : v.toExponential(1);

  return (
    <PanelShell id="noise" title="Noise model" defaultCollapsed>
      <div className="noise">
        <label className="noise__enable">
          <input
            type="checkbox"
            checked={noise.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <span>Enable noisy simulation</span>
        </label>
        <p className="noise__hint">
          Stochastic Pauli channels via quantum trajectories. Probabilities and Bloch
          vectors are averaged over N trajectories. Statevector / Density panels show
          a notice (mixed state not representable as a ket).
          {noise.enabled && (
            <>
              {" "}
              <strong>{noise.trajectories}</strong> trajectories per simulation.
            </>
          )}
        </p>

        <fieldset className="noise__group" disabled={!noise.enabled}>
          <legend>Depolarising rates</legend>
          <div className="noise__row">
            <label>1-qubit gates</label>
            <input
              type="range"
              min={0}
              max={0.1}
              step={0.0001}
              value={noise.oneQubitDepolarising}
              onChange={(e) =>
                set({ oneQubitDepolarising: parseFloat(e.target.value) })
              }
            />
            <span className="noise__value">{fmt(noise.oneQubitDepolarising)}</span>
          </div>
          <div className="noise__row">
            <label>2-qubit gates</label>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.0005}
              value={noise.twoQubitDepolarising}
              onChange={(e) =>
                set({ twoQubitDepolarising: parseFloat(e.target.value) })
              }
            />
            <span className="noise__value">{fmt(noise.twoQubitDepolarising)}</span>
          </div>
        </fieldset>

        <fieldset className="noise__group" disabled={!noise.enabled}>
          <legend>Trajectories</legend>
          <div className="noise__row">
            <label>count</label>
            <input
              type="number"
              min={1}
              max={8192}
              step={1}
              value={noise.trajectories}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) {
                  set({ trajectories: Math.max(1, Math.min(8192, v)) });
                }
              }}
            />
            <div className="noise__presets">
              {[64, 256, 1024, 4096].map((t) => (
                <button
                  key={t}
                  className={"noise__preset" + (noise.trajectories === t ? " noise__preset--on" : "")}
                  onClick={() => set({ trajectories: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      </div>
    </PanelShell>
  );
}
