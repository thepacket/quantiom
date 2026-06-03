import { useEffect, useMemo, useState } from "react";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { paulis as evalPaulis, pauliSumExpectation, type Pauli, type Observable } from "../sim/expectation";
import { noisyExpectationObservable } from "../sim/simulateNoisy";
import { useGPUNoisyPauli, type GPUObservable } from "./useGPUNoisyPauli";
import type { GPUPauli } from "../sim/webgpuTraj";
import { optimizeExpectation, zneFit, computeLandscape, barrenPlateauDiagnostic, type OptimizerKind } from "../sim/optimize";
import { parsePauliSum, pauliSumQubitCount } from "../sim/trotter";
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
  const [mode, setMode] = useState<"single" | "hamiltonian">("single");
  const [hText, setHText] = useState<string>("0.5 * Z + 0.3 * X");
  // Post-selection on a classical bit outcome. Only used when the circuit
  // has measurements + noise mode is on; otherwise the trajectory average
  // path isn't running and there's nothing to filter.
  const numClbits = noisyContext?.circuit.numClbits ?? 0;
  const hasMeasurements = useMemo(
    () => !!noisyContext?.circuit.gates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [noisyContext?.circuit],
  );
  const [postSelectOn, setPostSelectOn] = useState(false);
  const [postClbit, setPostClbit] = useState(0);
  const [postValue, setPostValue] = useState<0 | 1>(0);

  // Resize per-qubit Pauli selection when the circuit width changes.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.length === n) return prev;
      const next = new Array<Pauli>(n).fill("I");
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [n]);

  // Parse the Pauli-sum input — useMemo so the panel doesn't reparse on every render.
  const hParsed = useMemo<{ ok: true; terms: ReturnType<typeof parsePauliSum>; nH: number } | { ok: false; error: string }>(() => {
    try {
      const terms = parsePauliSum(hText);
      return { ok: true, terms, nH: pauliSumQubitCount(terms) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [hText]);

  // Build the observable that flows through to evaluators and tools.
  const observable: Observable | null = useMemo(() => {
    if (mode === "single") {
      return selection.length === n ? { kind: "pauli", paulis: selection } : null;
    }
    if (!hParsed.ok) return null;
    return { kind: "sum", terms: hParsed.terms };
  }, [mode, selection, n, hParsed]);

  // GPU-accelerated trajectory-averaged ⟨P⟩, when the circuit + noise +
  // observable all fit the WebGPU subset (1q-only, depolarising-only).
  // Returns null otherwise; the CPU path below remains the source of truth.
  // Single Pauli strings and weighted Pauli-sum Hamiltonians both route
  // to the GPU; the hook fires one shader dispatch per sum term and
  // accumulates on the CPU.
  const gpuObservable = useMemo<GPUObservable | null>(() => {
    if (collapsed) return null;
    if (!data?.isNoisy || !noisyContext) return null;
    if (mode === "single") {
      if (selection.length !== n) return null;
      return {
        kind: "pauli",
        paulis: selection.map((p) => (p === "X" || p === "Y" || p === "Z" ? p : "I")),
      };
    }
    // Hamiltonian sum mode.
    if (!hParsed.ok || hParsed.nH !== n) return null;
    return {
      kind: "sum",
      terms: hParsed.terms.map((t) => {
        const paulis: GPUPauli[] = new Array(n);
        for (let q = 0; q < n; q++) {
          const ch = t.paulis[q] ?? "I";
          paulis[q] = ch === "X" || ch === "Y" || ch === "Z" ? ch : "I";
        }
        return { coefficient: t.coefficient, paulis };
      }),
    };
  }, [collapsed, mode, data?.isNoisy, noisyContext, selection, n, hParsed]);
  const gpuValue = useGPUNoisyPauli(
    noisyContext?.circuit ?? ({ numQubits: 0, gates: [], numClbits: 0 } as Circuit),
    noisyContext?.paramValues ?? {},
    noisyContext?.customGates ?? [],
    noisyContext?.noise,
    !collapsed && !!gpuObservable,
    gpuObservable,
  );

  // O(n · 2^n) inner-product walk over the state. Skip while the panel
  // is hidden — that's the whole point of this guard. In noise mode, run
  // T trajectories and average rather than reading the biased single
  // representative trajectory.
  const value = useMemo(() => {
    if (collapsed) return null;
    if (!data || !observable) return null;
    if (mode === "hamiltonian" && hParsed.ok && hParsed.nH !== n) return null;
    if (data.isNoisy && noisyContext) {
      // Prefer the GPU trajectory-averaged value when it's available —
      // same trajectories, just dispatched on the GPU when the subset is
      // eligible. Falls back to the CPU sampler in every other case.
      if (gpuValue !== null && !postSelectOn) {
        return gpuValue;
      }
      const ps = postSelectOn && hasMeasurements && postClbit < numClbits
        ? { clbit: postClbit, value: postValue }
        : undefined;
      return noisyExpectationObservable(
        noisyContext.circuit,
        noisyContext.paramValues,
        noisyContext.customGates,
        noisyContext.noise,
        observable,
        ps,
      );
    }
    if (data.isStabilizer) {
      // Clifford fast path: tableau measurement gives ⟨P⟩ ∈ {−1, 0, +1}
      // exactly. Pauli-sum mode weights each term's ±1/0 by its coefficient.
      if (!data.pauliExpectation) return null;
      if (observable.kind === "pauli") return data.pauliExpectation(observable.paulis);
      let total = 0;
      for (const term of observable.terms) {
        if (term.coefficient === 0) continue;
        const paulis = new Array<Pauli>(n);
        for (let q = 0; q < n; q++) {
          const ch = term.paulis[q] ?? "I";
          paulis[q] = ch === "X" || ch === "Y" || ch === "Z" ? ch : "I";
        }
        total += term.coefficient * data.pauliExpectation(paulis);
      }
      return total;
    }
    if (observable.kind === "pauli") return evalPaulis(data.state, n, observable.paulis);
    return pauliSumExpectation(data.state, n, observable.terms);
  }, [data, observable, n, mode, hParsed, collapsed, noisyContext, postSelectOn, postClbit, postValue, hasMeasurements, numClbits, gpuValue]);

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

  const opDisplay = mode === "single"
    ? `⟨${opLabel}⟩`
    : `⟨H⟩` + (hParsed.ok ? ` (${hParsed.terms.length} terms)` : "");

  return (
    <div className="exp">
      <div className="exp__mode">
        <button
          className={"exp__mode-btn" + (mode === "single" ? " exp__mode-btn--on" : "")}
          onClick={() => setMode("single")}
        >
          single Pauli
        </button>
        <button
          className={"exp__mode-btn" + (mode === "hamiltonian" ? " exp__mode-btn--on" : "")}
          onClick={() => setMode("hamiltonian")}
        >
          Hamiltonian
        </button>
      </div>
      {mode === "single" ? (
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
      ) : (
        <div className="exp__hamil">
          <textarea
            className="exp__hamil-text"
            value={hText}
            onChange={(e) => setHText(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="0.5 * ZZ + 0.3 * XX - 0.2 * YZ"
          />
          {hParsed.ok ? (
            hParsed.nH !== n ? (
              <div className="panel__error">term width {hParsed.nH} ≠ circuit width {n}</div>
            ) : (
              <div className="exp__hamil-meta">{hParsed.terms.length} terms · {hParsed.nH} qubits</div>
            )
          ) : (
            <div className="panel__error">✗ {hParsed.error}</div>
          )}
        </div>
      )}
      {data.isNoisy && hasMeasurements && numClbits > 0 && (
        <div className="exp__postselect">
          <label className="exp__postselect-toggle">
            <input type="checkbox" checked={postSelectOn} onChange={(e) => setPostSelectOn(e.target.checked)} />
            <span>post-select on</span>
          </label>
          <span>c[</span>
          <select value={postClbit} onChange={(e) => setPostClbit(parseInt(e.target.value, 10))} disabled={!postSelectOn}>
            {Array.from({ length: numClbits }, (_, k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <span>] ==</span>
          <select value={postValue} onChange={(e) => setPostValue(parseInt(e.target.value, 10) as 0 | 1)} disabled={!postSelectOn}>
            <option value={0}>0</option>
            <option value={1}>1</option>
          </select>
        </div>
      )}
      <div className="exp__result">
        <span className="exp__op">{opDisplay}{postSelectOn && hasMeasurements ? ` | c[${postClbit}]=${postValue}` : ""}</span>
        <span className="exp__value">
          {value === null ? "—" : Number.isFinite(value) ? value.toFixed(4) : "no shots matched"}
        </span>
        {data.isNoisy && (
          <span className="exp__noisy-tag">avg of {data.trajectories} trajectories</span>
        )}
      </div>
      {noisyContext && observable && data.freeSymbols.length > 0 && (
        <Optimizer
          ctx={noisyContext}
          observable={observable}
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
  observable: Observable;
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
    // Run async so the UI updates between steps. The optimiser awaits the
    // GPU dispatch each step where applicable.
    setTimeout(async () => {
      try {
        const result = await optimizeExpectation(
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
        <select value={opt} onChange={(e) => setOpt(e.target.value as OptimizerKind)} title="Optimiser (QNG: Fubini-Study metric preconditioning, statevector mode only)">
          <option value="adam">Adam</option>
          <option value="sgd">SGD</option>
          <option value="qng">QNG</option>
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
      <DiagnosticTools ctx={ctx} observable={observable} picked={picked} />
    </div>
  );
}

function DiagnosticTools({
  ctx,
  observable,
  picked,
}: {
  ctx: OptimizerContext;
  observable: Observable;
  picked: Set<string>;
}) {
  const [busy, setBusy] = useState<"zne" | "landscape" | "plateau" | "pec" | null>(null);
  const [zne, setZne] = useState<{ samples: Array<{ scale: number; value: number }>; extrapolated: number; fit?: string } | null>(null);
  const [zneFitKind, setZneFitKind] = useState<"linear" | "quadratic">(() => {
    try { return (localStorage.getItem("quantiom:zne-fit") === "quadratic" ? "quadratic" : "linear"); } catch { return "linear"; }
  });
  const [landscape, setLandscape] = useState<{ grid: number[][]; symbols: string[] } | null>(null);
  const [plateau, setPlateau] = useState<{ varPerSym: number[]; symbols: string[] } | null>(null);
  const [pec, setPec] = useState<{
    value: number; trajectories: number; varianceOverhead: number;
    channels: { oneQDepol: number; phaseDamping: number; twoQDepol: number; amplitudeDamping: number };
    uninverted: string[];
  } | null>(null);

  const runPec = () => {
    if (!ctx.noise.enabled || busy) return;
    setBusy("pec");
    setTimeout(() => {
      try {
        // Lazy import to keep PEC out of the initial bundle for users who
        // don't enable noise.
        import("../sim/pec").then(({ pecExpectation }) => {
          const result = pecExpectation(
            ctx.circuit, ctx.paramValues, ctx.customGates, ctx.noise,
            observable, Math.max(32, ctx.noise.trajectories),
          );
          setPec(result);
        }).finally(() => setBusy(null));
      } catch {
        setBusy(null);
      }
    }, 0);
  };

  const runZne = () => {
    if (!ctx.noise.enabled || busy) return;
    setBusy("zne");
    setTimeout(async () => {
      try {
        const result = await zneFit(ctx.circuit, ctx.paramValues, ctx.customGates, observable, ctx.noise, [1, 2, 3], zneFitKind);
        setZne(result);
      } finally { setBusy(null); }
    }, 0);
  };

  const runLandscape = () => {
    const syms = [...picked];
    if (syms.length < 1 || syms.length > 2 || busy) return;
    setBusy("landscape");
    setTimeout(async () => {
      try {
        const grid = await computeLandscape(
          ctx.circuit, ctx.paramValues, ctx.customGates, observable,
          syms, syms.length === 1 ? 64 : 32, [-Math.PI, Math.PI],
          ctx.noise.enabled ? ctx.noise : undefined,
        );
        setLandscape({ grid, symbols: syms });
      } finally { setBusy(null); }
    }, 0);
  };

  const runPlateau = () => {
    const syms = [...picked];
    if (syms.length === 0 || busy) return;
    setBusy("plateau");
    setTimeout(async () => {
      try {
        const result = await barrenPlateauDiagnostic(
          ctx.circuit, ctx.customGates, observable, syms, 100,
          ctx.noise.enabled ? ctx.noise : undefined,
        );
        setPlateau({ varPerSym: result.variancePerSymbol, symbols: syms });
      } finally { setBusy(null); }
    }, 0);
  };

  return (
    <div className="exp__tools">
      <div className="exp__tools-bar">
        <button
          onClick={runLandscape}
          disabled={picked.size < 1 || picked.size > 2 || busy !== null}
          title="Sweep 1 or 2 picked symbols across [-π, π], render ⟨P⟩ as a curve / heatmap"
        >
          {busy === "landscape" ? "…" : "Landscape"}
        </button>
        <button
          onClick={runPlateau}
          disabled={picked.size === 0 || busy !== null}
          title="Sample 100 random parameter points, compute gradient variance — diagnoses barren plateaus"
        >
          {busy === "plateau" ? "…" : "Plateau"}
        </button>
        <button
          onClick={runZne}
          disabled={!ctx.noise.enabled || busy !== null}
          title={`Zero-noise extrapolation: run at 1× / 2× / 3× noise, ${zneFitKind} fit ⟨P⟩(γ→0)`}
        >
          {busy === "zne" ? "…" : "ZNE"}
        </button>
        <select
          value={zneFitKind}
          onChange={(e) => {
            const v = e.target.value === "quadratic" ? "quadratic" : "linear";
            setZneFitKind(v);
            try { localStorage.setItem("quantiom:zne-fit", v); } catch { /* ignore */ }
          }}
          disabled={busy !== null}
          style={{ fontSize: 11 }}
          title="Choose the ZNE extrapolation curve. Quadratic = exact 3-point Richardson interpolation."
        >
          <option value="linear">lin</option>
          <option value="quadratic">quad</option>
        </select>
        <button
          onClick={runPec}
          disabled={!ctx.noise.enabled || busy !== null}
          title="Probabilistic Error Cancellation (1q depolarising only): sign-weighted sampling against the inverse channel"
        >
          {busy === "pec" ? "…" : "PEC"}
        </button>
      </div>
      {landscape && <LandscapeView grid={landscape.grid} symbols={landscape.symbols} />}
      {plateau && (
        <div className="exp__tools-result">
          Barren-plateau diagnostic ({plateau.symbols.length} sym, 100 samples):
          {plateau.symbols.map((s, i) => (
            <div key={s} className="exp__tools-row">
              <span>{s}</span>
              <span className="exp__tools-val">Var(∂⟨P⟩/∂{s}) = {plateau.varPerSym[i].toExponential(2)}</span>
            </div>
          ))}
        </div>
      )}
      {zne && (
        <div className="exp__tools-result">
          ZNE samples: {zne.samples.map((s) => `${s.scale}×: ${s.value.toFixed(4)}`).join(" · ")}
          <div className="exp__tools-extrap">→ ⟨P⟩(γ=0) ≈ {zne.extrapolated.toFixed(4)}</div>
        </div>
      )}
      {pec && (
        <div className="exp__tools-result">
          PEC ⟨P⟩ ≈ {pec.value.toFixed(4)} ({pec.trajectories} shots ·
          {" "}1q-depol: {pec.channels.oneQDepol}, phase-damp: {pec.channels.phaseDamping}, amp-damp: {pec.channels.amplitudeDamping}, 2q-depol: {pec.channels.twoQDepol})
          <div className="exp__tools-extrap">
            variance overhead ≈ {pec.varianceOverhead.toExponential(2)}×
            {pec.varianceOverhead > 1e6 && " — consider lowering noise rates"}
          </div>
          {pec.uninverted.length > 0 && (
            <div className="exp__tools-extrap" style={{ color: "var(--warn, #d8a)" }}>
              not inverted: {pec.uninverted.join(", ")} — estimate is partial
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LandscapeView({ grid, symbols }: { grid: number[][]; symbols: string[] }) {
  // Min/max for color scaling.
  let minV = Infinity, maxV = -Infinity;
  for (const row of grid) for (const v of row) {
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const range = maxV - minV || 1;
  if (symbols.length === 1) {
    // 1D line chart.
    const W = 220, H = 60;
    const path = grid[0]
      .map((v, i) => {
        const x = (i / (grid[0].length - 1)) * W;
        const y = H - ((v - minV) / range) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return (
      <div className="exp__tools-result">
        Landscape over {symbols[0]} ∈ [-π, π]:
        <svg width={W} height={H} className="exp__opt-chart-svg">
          <path d={path} className="exp__opt-chart-line" fill="none" />
        </svg>
        <div className="exp__tools-extrap">range: [{minV.toFixed(3)}, {maxV.toFixed(3)}]</div>
      </div>
    );
  }
  // 2D heatmap.
  const cellSize = 6;
  const N = grid.length;
  return (
    <div className="exp__tools-result">
      Landscape over ({symbols[0]}, {symbols[1]}) ∈ [-π, π]²:
      <svg width={N * cellSize + 24} height={N * cellSize + 12} className="exp__landscape">
        {grid.map((row, j) =>
          row.map((v, i) => {
            const t = (v - minV) / range;
            // Diverging viridis-ish: low = dark blue, mid = teal, high = yellow.
            const r = Math.round(40 + 215 * t);
            const g = Math.round(40 + 180 * t);
            const b = Math.round(80 + 160 * (1 - t));
            return (
              <rect
                key={`${i}-${j}`}
                x={i * cellSize}
                y={j * cellSize}
                width={cellSize}
                height={cellSize}
                fill={`rgb(${r},${g},${b})`}
              />
            );
          }),
        )}
      </svg>
      <div className="exp__tools-extrap">range: [{minV.toFixed(3)}, {maxV.toFixed(3)}]</div>
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
