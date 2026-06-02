import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { paulis as evalPaulis, type Pauli } from "../sim/expectation";
import { noisyPauliExpectation } from "../sim/simulateNoisy";
import { optimizeExpectation, type OptimizerKind } from "../sim/optimize";
import type { NoiseModel } from "../sim/noise";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type OptimizerContext = {
  circuit: Circuit;
  paramValues: ParameterValues;
  customGates: CustomGate[];
  noise: NoiseModel;
  onParamChange: (next: ParameterValues) => void;
};

type Props = {
  state: SimState;
  /** Optional handles for re-running the simulator. When provided, the panel
   *  computes trajectory-averaged ⟨P⟩ in noise mode rather than displaying
   *  a single biased trajectory, and enables the Optimize button. */
  noisyContext?: OptimizerContext;
};

const PAULIS: Pauli[] = ["I", "X", "Y", "Z"];

export function ExpectationPanel({ state, noisyContext }: Props) {
  // Compute the copy text outside the body so PanelShell's toolbar can use it.
  // Light cost; the body's heavy memo skips when collapsed.
  return (
    <PanelShell id="expectation" title="Expectation ⟨P⟩" getCopyText={() => "(open panel to compute)"}>
      <ExpectationBody state={state} noisyContext={noisyContext} />
    </PanelShell>
  );
}

function ExpectationBody({ state, noisyContext }: Props) {
  const collapsed = usePanelCollapsed();
  const data = dataOf(state);
  const n = data?.numQubits ?? 0;
  const [selection, setSelection] = useState<Pauli[]>([]);

  // Resize per-qubit Pauli selection when the circuit width changes.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<Pauli>(n).fill("I");
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [n]);

  // O(n · 2^n) inner-product walk over the state. Skip while the panel
  // is hidden — that's the whole point of this guard. In noise mode, run
  // T trajectories and average rather than reading the biased single
  // representative trajectory.
  const value = useMemo(() => {
    if (collapsed) return null;
    if (!data || selection.length !== n) return null;
    if (data.isNoisy && noisyContext) {
      return noisyPauliExpectation(
        noisyContext.circuit,
        noisyContext.paramValues,
        noisyContext.customGates,
        noisyContext.noise,
        selection,
      );
    }
    if (data.isStabilizer) return null;
    return evalPaulis(data.state, n, selection);
  }, [data, selection, n, collapsed, noisyContext]);

  const opLabel = useMemo(() => {
    const parts: string[] = [];
    for (let q = 0; q < selection.length; q++) {
      if (selection[q] !== "I") parts.push(`${selection[q]}${sub(q)}`);
    }
    return parts.length ? parts.join(" ") : "I";
  }, [selection]);

  const setQubit = (q: number, p: Pauli) => {
    setSelection((prev) => {
      const next = [...prev];
      next[q] = p;
      return next;
    });
  };

  if (!data) return <div className="panel__placeholder">building circuit…</div>;
  if (n === 0) return null;
  if (data.isStabilizer) {
    return (
      <div className="panel__notice">
        Clifford fast path — multi-qubit ⟨P⟩ via tableau measurement is
        on the follow-up list. Bloch panel gives single-qubit ⟨X/Y/Z⟩
        directly.
      </div>
    );
  }

  return (
    <div className="exp">
      <div className="exp__row">
        {selection.map((p, q) => (
          <div key={q} className="exp__cell">
            <span className="exp__qubit">q{q}</span>
            <select className="exp__pauli" value={p} onChange={(e) => setQubit(q, e.target.value as Pauli)}>
              {PAULIS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="exp__result">
        <span className="exp__op">⟨{opLabel}⟩</span>
        <span className="exp__value">{value === null ? "—" : value.toFixed(4)}</span>
        {data.isNoisy && (
          <span className="exp__noisy-tag">avg of {data.trajectories} trajectories</span>
        )}
      </div>
      {noisyContext && data.freeSymbols.length > 0 && (
        <Optimizer
          ctx={noisyContext}
          observable={selection}
          freeSymbols={data.freeSymbols}
          currentValue={value}
        />
      )}
    </div>
  );
}

function Optimizer({
  ctx,
  observable,
  freeSymbols,
  currentValue,
}: {
  ctx: OptimizerContext;
  observable: Pauli[];
  freeSymbols: string[];
  currentValue: number | null;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(freeSymbols));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: number; value: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [steps, setSteps] = useState(30);
  const [lr, setLr] = useState(0.1);
  const [goal, setGoal] = useState<"minimize" | "maximize">("minimize");
  const [opt, setOpt] = useState<OptimizerKind>("adam");
  const cancelRef = { current: false };

  // Keep `picked` in sync when free symbols set changes.
  useEffect(() => {
    setPicked((prev) => {
      const next = new Set<string>();
      for (const s of freeSymbols) if (prev.has(s) || prev.size === 0) next.add(s);
      // If `prev` was empty (initial), default to all symbols.
      return next.size === 0 ? new Set(freeSymbols) : next;
    });
  }, [freeSymbols]);

  const toggle = (s: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const start = () => {
    if (running || picked.size === 0) return;
    setRunning(true);
    setProgress({ step: 0, value: currentValue ?? 0 });
    const localHistory: number[] = [];
    setHistory([]);
    // Run async so the UI updates between steps.
    setTimeout(() => {
      try {
        const result = optimizeExpectation(
          ctx.circuit,
          ctx.customGates,
          {
            symbols: [...picked],
            observable,
            initial: ctx.paramValues,
            steps,
            learningRate: lr,
            epsilon: 1e-3,
            goal,
            optimizer: opt,
            onProgress: (step, value, params) => {
              setProgress({ step, value });
              localHistory.push(value);
              // Throttle history flushes too — copy into state every 2 steps.
              if (step % 2 === 0 || step === steps) setHistory([...localHistory]);
              if (step % 4 === 0 || step === steps) ctx.onParamChange({ ...params });
              return !cancelRef.current;
            },
          },
          ctx.noise.enabled ? ctx.noise : undefined,
        );
        ctx.onParamChange({ ...result.finalParams });
        setProgress({ step: result.steps, value: result.finalValue });
        setHistory([...localHistory]);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const stop = () => { cancelRef.current = true; };

  return (
    <div className="exp__opt">
      <div className="exp__opt-head">
        <span>Optimise ⟨P⟩ over free symbols</span>
      </div>
      <div className="exp__opt-syms">
        {freeSymbols.map((s) => (
          <label key={s} className={"exp__opt-sym" + (picked.has(s) ? " exp__opt-sym--on" : "")}>
            <input type="checkbox" checked={picked.has(s)} onChange={() => toggle(s)} />
            {s}
          </label>
        ))}
      </div>
      <div className="exp__opt-config">
        <select value={goal} onChange={(e) => setGoal(e.target.value as "minimize" | "maximize")}>
          <option value="minimize">minimise</option>
          <option value="maximize">maximise</option>
        </select>
        <select value={opt} onChange={(e) => setOpt(e.target.value as OptimizerKind)} title="Optimiser">
          <option value="adam">Adam</option>
          <option value="sgd">SGD</option>
        </select>
        <label>steps
          <input type="number" min={1} max={500} value={steps} onChange={(e) => setSteps(parseInt(e.target.value || "30", 10))} />
        </label>
        <label>lr
          <input type="number" min={0.001} step={0.01} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || "0.1"))} />
        </label>
        {!running ? (
          <button className="exp__opt-run" onClick={start} disabled={picked.size === 0}>Run</button>
        ) : (
          <button className="exp__opt-run exp__opt-run--stop" onClick={stop}>Stop</button>
        )}
      </div>
      {progress && (
        <div className="exp__opt-progress">
          step {progress.step}/{steps} · ⟨P⟩={progress.value.toFixed(4)}
        </div>
      )}
      {history.length > 1 && <HistoryChart history={history} goal={goal} />}
    </div>
  );
}

function HistoryChart({ history, goal }: { history: number[]; goal: "minimize" | "maximize" }) {
  const W = 200, H = 36;
  const minV = Math.min(...history);
  const maxV = Math.max(...history);
  const range = maxV - minV || 1;
  const path = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - ((v - minV) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const best = goal === "minimize" ? minV : maxV;
  return (
    <div className="exp__opt-chart">
      <svg width={W} height={H} className="exp__opt-chart-svg">
        <path d={path} className="exp__opt-chart-line" fill="none" />
      </svg>
      <div className="exp__opt-chart-meta">
        best ⟨P⟩ = {best.toFixed(4)}
      </div>
    </div>
  );
}

function sub(n: number): string {
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return n
    .toString()
    .split("")
    .map((d) => digits[parseInt(d, 10)])
    .join("");
}
