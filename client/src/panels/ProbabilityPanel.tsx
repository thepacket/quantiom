import { useEffect, useMemo, useRef, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { sampleShots } from "../sim/sample";
import { useEndianness, displayAmplitudes, displayProbabilities } from "./endianness";

type Props = {
  state: SimState;
  /** Optional GPU-computed probabilities that override `state.probabilities`
   *  when present. Used by the WebGPU trajectory fast path in noise mode.
   *  Length must equal 2^numQubits. */
  gpuProbabilities?: number[] | null;
  /** Optional trajectory-averaged |amp|² distribution computed by running
   *  the circuit N independent times with a fresh RNG. Used when the
   *  circuit has measurements, since a single deterministic-RNG run
   *  collapses to one branch and reports a misleading single-state
   *  distribution. Takes precedence over `gpuProbabilities` when both
   *  are present (a circuit with measurements wouldn't fit the GPU
   *  path anyway, but the order is fixed for predictability). */
  sampledProbabilities?: number[] | null;
  /** Number of shots used to build `sampledProbabilities` — surfaced in
   *  a small note so users know what they're looking at. */
  sampledShots?: number;
  /** Tick counter from the right-column auto-shots timer. When the panel
   *  is in "shots" mode, each new value forces a fresh resample. */
  shotsTick?: number;
};
type Mode = "exact" | "shots";

const BAR_H = 14;
const SHOT_PRESETS = [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000];

const MODE_STORAGE_KEY = "quantiom:probabilities-mode";
const SHOTS_STORAGE_KEY = "quantiom:probabilities-shots";

function loadInitialMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    if (v === "shots" || v === "exact") return v;
  } catch { /* ignore */ }
  return "exact";
}

function loadInitialShots(): number {
  try {
    const v = parseInt(localStorage.getItem(SHOTS_STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* ignore */ }
  return 1_000;
}

export function ProbabilityPanel({ state, gpuProbabilities, sampledProbabilities, sampledShots, shotsTick }: Props) {
  const collapsed = usePanelCollapsed();
  const { endian } = useEndianness();
  const data = dataOf(state);
  const [mode, setMode] = useState<Mode>(loadInitialMode);
  const [shots, setShots] = useState<number>(loadInitialShots);
  const [sortDesc, setSortDesc] = useState<boolean>(() => {
    try { return localStorage.getItem("quantiom:probabilities-sort") === "desc"; } catch { return false; }
  });
  const [showAll, setShowAll] = useState<boolean>(false);
  const dim = data?.probabilities.length ?? 0;
  const effectiveProbs =
    sampledProbabilities && sampledProbabilities.length === dim
      ? sampledProbabilities
      : gpuProbabilities && gpuProbabilities.length === dim
        ? gpuProbabilities
        : data?.probabilities ?? null;
  const probSource: "sampled" | "gpu" | "exact" =
    sampledProbabilities && sampledProbabilities.length === dim
      ? "sampled"
      : gpuProbabilities && gpuProbabilities.length === dim
        ? "gpu"
        : "exact";
  // Bumping this nonce forces a fresh sample without changing other deps.
  const [sampleNonce, setSampleNonce] = useState(0);

  // Auto-resample on every shotsTick change when the panel is in "shots"
  // mode. The tickRef guard prevents the initial-mount tick from firing
  // before the user has explicitly switched to shots mode.
  const lastTickRef = useRef<number | undefined>(shotsTick);
  useEffect(() => {
    if (shotsTick === undefined) return;
    if (lastTickRef.current === shotsTick) return;
    lastTickRef.current = shotsTick;
    if (mode === "shots") setSampleNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsTick]);

  const counts = useMemo<number[] | null>(() => {
    if (collapsed || mode !== "shots" || !effectiveProbs) return null;
    return sampleShots(effectiveProbs, shots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, effectiveProbs, shots, sampleNonce, collapsed]);

  const updateMode = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(MODE_STORAGE_KEY, m); } catch { /* ignore */ }
  };
  const updateShots = (n: number) => {
    setShots(n);
    try { localStorage.setItem(SHOTS_STORAGE_KEY, String(n)); } catch { /* ignore */ }
  };

  const copy = () => {
    if (!data || !effectiveProbs) return "";
    const amps = displayAmplitudes(data.amplitudes, data.numQubits, endian);
    const dProbs = displayProbabilities(effectiveProbs, data.numQubits, endian);
    if (mode === "exact" || !counts) {
      return amps
        .map((a, i) => `|${a.basis}>  ${(dProbs[i] * 100).toFixed(2)}%`)
        .join("\n");
    }
    const dCounts = displayProbabilities(counts, data.numQubits, endian);
    return [
      `shots: ${shots}`,
      ...amps.map((a, i) => `|${a.basis}>  ${dCounts[i]}  (${((dCounts[i] / shots) * 100).toFixed(2)}%)`),
    ].join("\n");
  };

  return (
    <PanelShell
      id="probabilities"
      title="Probabilities"
      getCopyText={copy}
      toolbar={
        <div className="prob__mode">
          <button
            className={"prob__mode-btn" + (mode === "exact" ? " prob__mode-btn--on" : "")}
            onClick={() => updateMode("exact")}
            title="Exact probabilities |a|²"
          >
            exact
          </button>
          <button
            className={"prob__mode-btn" + (mode === "shots" ? " prob__mode-btn--on" : "")}
            onClick={() => updateMode("shots")}
            title="Sample N measurement outcomes from the distribution"
          >
            shots
          </button>
          <button
            className={"prob__mode-btn" + (sortDesc ? " prob__mode-btn--on" : "")}
            onClick={() => {
              const next = !sortDesc;
              setSortDesc(next);
              try { localStorage.setItem("quantiom:probabilities-sort", next ? "desc" : "basis"); } catch { /* ignore */ }
            }}
            title="Sort rows by descending probability"
          >
            sort
          </button>
        </div>
      }
    >
      {!data ? (
        <div className="panel__placeholder">building circuit…</div>
      ) : data.isStabilizer ? (
        <div className="panel__notice">
          Clifford fast path ({data.numQubits} qubits). The full probability
          distribution has 2<sup>{data.numQubits}</sup> outcomes; a basis-state
          sampler over a stabilizer state is on the follow-up list. The Bloch
          panel gives the exact per-qubit marginals (each = (1+r·z)/2 for the
          Z eigenstate convention).
        </div>
      ) : (
        <>
          {mode === "shots" && (
            <div className="prob__shots-bar">
              <label className="prob__shots-label">N</label>
              <select
                className="prob__shots-select"
                value={shots}
                onChange={(e) => updateShots(parseInt(e.target.value, 10))}
              >
                {SHOT_PRESETS.map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
              <button
                className="prob__resample"
                onClick={() => setSampleNonce((n) => n + 1)}
                title="Resample"
              >
                ↻
              </button>
            </div>
          )}
          <ProbabilityChart
            data={data}
            probs={effectiveProbs ?? data.probabilities}
            mode={mode}
            counts={counts}
            shots={shots}
            sortDesc={sortDesc}
            limit={showAll ? Infinity : 64}
            onToggleShowAll={() => setShowAll((v) => !v)}
            showAll={showAll}
          />
          {probSource === "sampled" && (
            <div className="prob__note">
              Averaged across {sampledShots ?? "?"} trajectory shots (circuit has measurements — single-shot |amp|² would be pinned to one collapse branch).
            </div>
          )}
          {probSource === "gpu" && (
            <div className="prob__note">WebGPU: {gpuProbabilities!.length} bins from trajectory average</div>
          )}
        </>
      )}
    </PanelShell>
  );
}

function ProbabilityChart({
  data,
  probs,
  mode,
  counts,
  shots,
  sortDesc,
  limit,
  onToggleShowAll,
  showAll,
}: {
  data: NonNullable<ReturnType<typeof dataOf>>;
  probs: number[];
  mode: Mode;
  counts: number[] | null;
  shots: number;
  sortDesc: boolean;
  limit: number;
  onToggleShowAll: () => void;
  showAll: boolean;
}) {
  const { endian } = useEndianness();
  // Relabel / re-order for the chosen display endianness (display only).
  const amps = displayAmplitudes(data.amplitudes, data.numQubits, endian);
  const dProbs = displayProbabilities(probs, data.numQubits, endian);
  const dCounts = counts ? displayProbabilities(counts, data.numQubits, endian) : null;
  const exactProbs = dProbs.map((p) => p ?? 0);
  const empirical = mode === "shots" && dCounts
    ? dCounts.map((c) => c / Math.max(1, shots))
    : exactProbs;
  // Build display ordering: by basis index (canonical) or by descending probability.
  let order = amps.map((_, i) => i);
  if (sortDesc) {
    order = order.slice().sort((a, b) => empirical[b] - empirical[a]);
  }
  const total = order.length;
  const overflow = total > limit;
  const visibleOrder = overflow ? order.slice(0, limit) : order;
  const maxBar = Math.max(0.01, ...visibleOrder.map((i) => Math.max(empirical[i], exactProbs[i])));
  const width = 280;
  const labelW = 50;
  return (
    <>
      <svg width={width} height={visibleOrder.length * (BAR_H + 4) + 8} className="prob__svg">
        {visibleOrder.map((i, row) => {
          const a = amps[i];
          const p = empirical[i];
          const exactP = exactProbs[i];
          const barW = (width - labelW - 60) * (p / maxBar);
          const exactW = (width - labelW - 60) * (exactP / maxBar);
          const y = row * (BAR_H + 4) + 4;
          const isZero = p < 1e-9 && exactP < 1e-9;
          return (
            <g key={a.index}>
              <text x={labelW - 6} y={y + BAR_H / 2 + 4} className="prob__basis" textAnchor="end">
                |{a.basis}⟩
              </text>
              {mode === "shots" && (
                <rect
                  x={labelW}
                  y={y}
                  width={Math.max(0, exactW)}
                  height={BAR_H}
                  className="prob__exact-shadow"
                  rx={2}
                />
              )}
              <rect
                x={labelW}
                y={y}
                width={Math.max(0, barW)}
                height={BAR_H}
                className={isZero ? "prob__bar prob__bar--zero" : "prob__bar"}
                rx={2}
              />
              <text x={labelW + Math.max(barW, exactW) + 4} y={y + BAR_H / 2 + 4} className="prob__pct">
                {mode === "shots" && dCounts
                  ? `${dCounts[i]}`
                  : `${(p * 100).toFixed(1)}%`}
              </text>
            </g>
          );
        })}
      </svg>
      {overflow && (
        <button
          className="prob__resample"
          onClick={onToggleShowAll}
          title={showAll ? "Show top 64 only" : `Show all ${total} outcomes`}
          style={{ marginTop: 4 }}
        >
          {showAll ? "Top 64" : `Show all ${total}`}
        </button>
      )}
    </>
  );
}
