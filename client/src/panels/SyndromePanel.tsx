import { useMemo, useState } from "react";
import { PanelShell } from "./PanelShell";
import { isCliffordOnly, sampleSyndromes } from "../sim/stabilizer";
import { expandCustomGates, type CustomGate } from "../editor/customGates";
import type { Circuit } from "../editor/types";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
};

const SHOT_PRESETS = [100, 1024, 8192, 100_000];

/**
 * Syndrome histogram for Clifford-only circuits with measurements. Runs the
 * tableau simulator `shots` times, sampling fresh measurement outcomes per
 * shot, and tabulates counts per classical bitstring. Foundation for QEC
 * decoder benchmarking — Stim's headline workload, now in a browser tab.
 */
export function SyndromePanel({ circuit, customGates }: Props) {
  return (
    <PanelShell id="syndromes" title="Syndromes (Clifford shots)" defaultCollapsed>
      <SyndromeBody circuit={circuit} customGates={customGates} />
    </PanelShell>
  );
}

function SyndromeBody({ circuit, customGates }: Props) {
  const [shots, setShots] = useState(1024);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  const expandedGates = useMemo(() => expandCustomGates(circuit.gates, customGates), [circuit, customGates]);
  const eligible = isCliffordOnly(expandedGates) && circuit.numClbits > 0;

  const hasMeasurements = useMemo(
    () => expandedGates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [expandedGates],
  );

  const sample = () => {
    if (!eligible || !hasMeasurements) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const result = sampleSyndromes(circuit.numQubits, expandedGates, circuit.numClbits, shots);
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
        <button className="syndromes__run" onClick={sample} disabled={busy}>
          {busy ? "Sampling…" : "Sample"}
        </button>
      </div>
      {counts && <SyndromeHistogram counts={counts} key={nonce} numClbits={circuit.numClbits} />}
    </div>
  );
}

function SyndromeHistogram({ counts, numClbits }: { counts: Map<string, number>; numClbits: number }) {
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
