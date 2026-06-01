import { useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { sampleShots } from "../sim/sample";

type Props = { state: SimState };
type Mode = "exact" | "shots";

const BAR_H = 14;
const SHOT_PRESETS = [100, 1024, 8192, 100_000];

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
  return 1024;
}

export function ProbabilityPanel({ state }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const [mode, setMode] = useState<Mode>(loadInitialMode);
  const [shots, setShots] = useState<number>(loadInitialShots);
  // Bumping this nonce forces a fresh sample without changing other deps.
  const [sampleNonce, setSampleNonce] = useState(0);

  const counts = useMemo<number[] | null>(() => {
    if (collapsed || mode !== "shots" || !data) return null;
    return sampleShots(data.probabilities, shots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, data, shots, sampleNonce, collapsed]);

  const updateMode = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem(MODE_STORAGE_KEY, m); } catch { /* ignore */ }
  };
  const updateShots = (n: number) => {
    setShots(n);
    try { localStorage.setItem(SHOTS_STORAGE_KEY, String(n)); } catch { /* ignore */ }
  };

  const copy = () => {
    if (!data) return "";
    if (mode === "exact" || !counts) {
      return data.amplitudes
        .map((a, i) => `|${a.basis}>  ${(data.probabilities[i] * 100).toFixed(2)}%`)
        .join("\n");
    }
    return [
      `shots: ${shots}`,
      ...data.amplitudes.map((a, i) => `|${a.basis}>  ${counts[i]}  (${((counts[i] / shots) * 100).toFixed(2)}%)`),
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
        </div>
      }
    >
      {!data ? (
        <div className="panel__placeholder">building circuit…</div>
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
          <ProbabilityChart data={data} mode={mode} counts={counts} shots={shots} />
        </>
      )}
    </PanelShell>
  );
}

function ProbabilityChart({
  data,
  mode,
  counts,
  shots,
}: {
  data: NonNullable<ReturnType<typeof dataOf>>;
  mode: Mode;
  counts: number[] | null;
  shots: number;
}) {
  const exactProbs = data.probabilities.map((p) => p ?? 0);
  const empirical = mode === "shots" && counts
    ? counts.map((c) => c / Math.max(1, shots))
    : exactProbs;
  const maxBar = Math.max(0.01, ...empirical, ...exactProbs);
  const width = 280;
  const labelW = 50;
  return (
    <svg width={width} height={data.amplitudes.length * (BAR_H + 4) + 8} className="prob__svg">
      {data.amplitudes.map((a, i) => {
        const p = empirical[i];
        const exactP = exactProbs[i];
        const barW = (width - labelW - 60) * (p / maxBar);
        const exactW = (width - labelW - 60) * (exactP / maxBar);
        const y = i * (BAR_H + 4) + 4;
        const isZero = p < 1e-9 && exactP < 1e-9;
        return (
          <g key={a.index}>
            <text x={labelW - 6} y={y + BAR_H / 2 + 4} className="prob__basis" textAnchor="end">
              |{a.basis}⟩
            </text>
            {/* In shots mode, show the exact distribution as a faint outline behind the sampled bar. */}
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
              {mode === "shots" && counts
                ? `${counts[i]}`
                : `${(p * 100).toFixed(1)}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
