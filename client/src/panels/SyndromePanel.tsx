import { useEffect, useMemo, useRef, useState } from "react";
import { PanelShell } from "./PanelShell";
import { useEndianness, reverseLabel } from "./endianness";
import { isCliffordOnly, sampleSyndromes } from "../sim/stabilizer";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import type { Circuit } from "../editor/types";

import type { NoiseModel } from "../sim/noise";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  noise?: NoiseModel;
  /** Tick from the auto-shots timer — when set, re-fires sample() on each
   *  new value (provided the panel is eligible and not already busy). */
  shotsTick?: number;
};

const SHOT_PRESETS = [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000];

/**
 * Syndrome histogram for Clifford-only circuits with measurements. Runs the
 * tableau simulator `shots` times, sampling fresh measurement outcomes per
 * shot, and tabulates counts per classical bitstring. Foundation for QEC
 * decoder benchmarking — Stim's headline workload, now in a browser tab.
 */
export function SyndromePanel({ circuit, customGates, noise, shotsTick }: Props) {
  return (
    <PanelShell id="syndromes" title="Syndromes (Clifford shots)" defaultCollapsed unverified>
      <SyndromeBody circuit={circuit} customGates={customGates} noise={noise} shotsTick={shotsTick} />
    </PanelShell>
  );
}

function SyndromeBody({ circuit, customGates, noise, shotsTick }: Props) {
  const [shots, setShots] = useState(1_000);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [useNoise, setUseNoise] = useState(false);

  const expandedGates = useMemo(() => expandCustomGates(circuit.gates, customGates), [circuit, customGates]);
  const eligible = isCliffordOnly(expandedGates) && circuit.numClbits > 0;

  const hasMeasurements = useMemo(
    () => expandedGates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [expandedGates],
  );

  // Auto-fire sample() on every shotsTick from the right-column timer.
  const lastTickRef = useRef<number | undefined>(shotsTick);
  useEffect(() => {
    if (shotsTick === undefined) return;
    if (lastTickRef.current === shotsTick) return;
    lastTickRef.current = shotsTick;
    if (busy || !eligible || !hasMeasurements) return;
    sample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsTick]);

  const sample = () => {
    if (!eligible || !hasMeasurements) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const noiseProfile = useNoise && noise?.enabled
          ? {
              oneQubitDepolarising: noise.oneQubitDepolarising,
              twoQubitDepolarising: noise.twoQubitDepolarising,
              perGate: noise.perGate,
            }
          : undefined;
        const result = sampleSyndromes(circuit.numQubits, expandedGates, circuit.numClbits, shots, noiseProfile);
        setCounts(result);
      } finally {
        setBusy(false);
        setNonce((n) => n + 1);
      }
    }, 0);
  };

  if (!eligible) {
    return (
      <div className="panel__placeholder">
        Add at least one classical bit and keep the circuit Clifford-only
        ({"{H, S, S†, CX, CY, CZ, SWAP, X, Y, Z, √X, √X†}"} plus measurements)
        to sample syndromes via the tableau path.
      </div>
    );
  }
  if (!hasMeasurements) {
    return (
      <div className="panel__placeholder">
        No measurements yet — add a measure gate to start collecting syndromes.
      </div>
    );
  }

  return (
    <div className="syndromes">
      <div className="syndromes__bar">
        <label className="syndromes__label">shots</label>
        <select
          className="syndromes__select"
          value={shots}
          onChange={(e) => setShots(parseInt(e.target.value, 10))}
        >
          {SHOT_PRESETS.map((n) => (
            <option key={n} value={n}>{n.toLocaleString()}</option>
          ))}
        </select>
        {noise?.enabled && (
          <label className="tomo__noise" title="Use Pauli frame tracking: depolarising errors propagate as a Pauli frame through the tableau">
            <input type="checkbox" checked={useNoise} onChange={(e) => setUseNoise(e.target.checked)} />
            noise
          </label>
        )}
        <button className="syndromes__run" onClick={sample} disabled={busy}>
          {busy ? "Sampling…" : "Sample"}
        </button>
      </div>
      {counts && <SyndromeHistogram counts={counts} key={nonce} numClbits={circuit.numClbits} />}
    </div>
  );
}

function SyndromeHistogram({ counts, numClbits }: { counts: Map<string, number>; numClbits: number }) {
  const { endian } = useEndianness();
  const total = useMemo(() => {
    let s = 0;
    for (const c of counts.values()) s += c;
    return s;
  }, [counts]);
  const entries = useMemo(() => {
    const arr = [...counts.entries()];
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 64); // cap the rendered rows
  }, [counts]);
  const max = entries.length > 0 ? entries[0][1] : 1;
  return (
    <div className="syndromes__list">
      <div className="syndromes__total">{total.toLocaleString()} shots · {counts.size} distinct outcomes</div>
      <table className="syndromes__table">
        <tbody>
          {entries.map(([bits, c]) => {
            const pct = total > 0 ? (c / total) * 100 : 0;
            return (
              <tr key={bits}>
                <td className="syndromes__bits">|{endian === "little" ? reverseLabel(bits.padStart(numClbits, "0")) : bits.padStart(numClbits, "0")}⟩</td>
                <td className="syndromes__bar-cell">
                  <div className="syndromes__bar-bg">
                    <div className="syndromes__bar-fg" style={{ width: `${(c / max) * 100}%` }} />
                  </div>
                </td>
                <td className="syndromes__count">{c.toLocaleString()}</td>
                <td className="syndromes__pct">{pct.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
