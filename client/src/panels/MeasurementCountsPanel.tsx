import { useEffect, useMemo, useRef, useState } from "react";
import { PanelShell } from "./PanelShell";
import { sampleMeasurementShots } from "../sim/measurementShots";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  /** Tick counter from the right-column auto-shots timer. Each new value
   *  re-fires `sample()` automatically. Ignored when undefined. */
  shotsTick?: number;
};

const SHOT_PRESETS = [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000];

/**
 * Measurement counts panel. For circuits with mid-circuit measurement (and
 * possibly classical-conditioned gates), runs N independent simulations
 * and tabulates the resulting classical-register bitstrings — the
 * dynamic-circuit equivalent of the Probabilities panel's shots mode.
 */
export function MeasurementCountsPanel(props: Props) {
  return (
    <PanelShell id="measurement-counts" title="Measurement counts" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues, shotsTick }: Props) {
  const [shots, setShots] = useState(1_000);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  const hasMeasurement = useMemo(
    () => circuit.gates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [circuit],
  );

  const sample = () => {
    if (!hasMeasurement || circuit.numClbits === 0) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const result = sampleMeasurementShots(circuit, paramValues, customGates, shots);
        setCounts(result);
      } finally {
        setBusy(false);
        setNonce((n) => n + 1);
      }
    }, 0);
  };

  // Auto-fire sample() on every shotsTick change. The `busy` guard means a
  // slow sample doesn't pile up if the user picks a fast rate on a large
  // shot count — ticks that arrive mid-flight are simply skipped. The
  // tickRef + initial-mount guard avoid sampling immediately at first
  // render before the user has chosen what they want to see.
  const lastTickRef = useRef<number | undefined>(shotsTick);
  useEffect(() => {
    if (shotsTick === undefined) return;
    if (lastTickRef.current === shotsTick) return;
    lastTickRef.current = shotsTick;
    if (busy) return;
    if (!hasMeasurement || circuit.numClbits === 0) return;
    sample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsTick]);

  if (!hasMeasurement || circuit.numClbits === 0) {
    return (
      <div className="panel__placeholder">
        Add a measurement gate (and at least one classical bit) to enable
        dynamic-circuit shot sampling.
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
        <button className="syndromes__run" onClick={sample} disabled={busy}>
          {busy ? "Sampling…" : "Sample"}
        </button>
      </div>
      {counts && counts.size > 0 && <Hist counts={counts} key={nonce} numClbits={circuit.numClbits} />}
      {counts && counts.size === 0 && (
        <div className="panel__placeholder">No shots produced a classical register value.</div>
      )}
    </div>
  );
}

function Hist({ counts, numClbits }: { counts: Map<string, number>; numClbits: number }) {
  const total = useMemo(() => {
    let s = 0;
    for (const c of counts.values()) s += c;
    return s;
  }, [counts]);
  const entries = useMemo(() => {
    const arr = [...counts.entries()];
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, 64);
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
                <td className="syndromes__bits">|{bits.padStart(numClbits, "0")}⟩</td>
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
