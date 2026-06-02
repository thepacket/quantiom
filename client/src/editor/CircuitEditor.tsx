import { useEffect, useMemo, useRef, useState } from "react";
import { version as APP_VERSION } from "../../package.json";
import { useTabs } from "./tabs";
import { TabStrip } from "./TabStrip";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { StepBar } from "./StepBar";
import { loadCustomGates, newCustomGateId, saveCustomGates, type CustomGate } from "./customGates";
import type { Circuit } from "./types";

/**
 * Compute the set of gate ids matching a free-form find query. Matches on:
 *   - gate id ("rx", "ccx")
 *   - "qN" tokens (qubit indices the gate touches)
 *   - any qubit display name (e.g. "data", "ancilla")
 *   - parameter substring (raw or asciified — we match against the raw
 *     symbolic text the user typed)
 * Empty query → undefined (no highlight).
 */
function findMatches(circuit: Circuit, query: string): Set<string> | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const matched = new Set<string>();
  for (const g of circuit.gates) {
    if (g.gateId.toLowerCase().includes(q)) { matched.add(g.id); continue; }
    const qubits = [...g.controls, ...g.targets];
    let hit = false;
    for (const i of qubits) {
      if (q === `q${i}`) { hit = true; break; }
      const name = circuit.qubitNames?.[i]?.toLowerCase();
      if (name && name.includes(q)) { hit = true; break; }
    }
    if (hit) { matched.add(g.id); continue; }
    if (g.params.some((p) => p.toLowerCase().includes(q))) matched.add(g.id);
  }
  return matched;
}
import { decodeCircuitFromHash } from "./shareLink";
import { inverseGates } from "./inverse";
import { transpile, type TranspileTarget } from "../sim/transpile";
import { routeCircuit } from "../sim/router";
import { optimiseCircuit } from "../sim/optimisePasses";
import { compileForDevice } from "../sim/compile";
import { recordAnimationWebM } from "./recordAnimation";
import { StatevectorPanel } from "../panels/StatevectorPanel";
import { QasmPanel } from "../panels/QasmPanel";
import { ProbabilityPanel } from "../panels/ProbabilityPanel";
import { BlochPanel } from "../panels/BlochPanel";
import { ExpectationPanel } from "../panels/ExpectationPanel";
import { DensityPanel } from "../panels/DensityPanel";
import { NoisePanel } from "../panels/NoisePanel";
import { PhaseDiskPanel } from "../panels/PhaseDiskPanel";
import { ResourcePanel } from "../panels/ResourcePanel";
import { ComparePanel } from "../panels/ComparePanel";
import { ChatPanel } from "../panels/ChatPanel";
import { EquivalencePanel } from "../panels/EquivalencePanel";
import { SyndromePanel } from "../panels/SyndromePanel";
import { MeasurementCountsPanel } from "../panels/MeasurementCountsPanel";
import { sampleAveragedAmplitudeProbabilities } from "../sim/measurementShots";
import { TomographyPanel } from "../panels/TomographyPanel";
import { HamiltonianPanel } from "../panels/HamiltonianPanel";
import { ParameterPanel } from "../panels/ParameterPanel";
import { ErrorBoundary } from "../panels/ErrorBoundary";
import { useStatevector, dataOf } from "../panels/useSimulation";
import { useGPUNoisyProbabilities } from "../panels/useGPUNoisyProbabilities";
import { loadNoise, saveNoise, type NoiseModel } from "../sim/noise";

function HistoryButton({
  canUndo,
  canRedo,
  onJumpBack,
  onJumpForward,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onJumpBack: (n: number) => void;
  onJumpForward: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const jumps = [5, 10, 25, 100];
  return (
    <span style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Jump multiple undo / redo steps at once">History…</button>
      {open && (
        <div className="examples-picker__pop" style={{ width: 180, top: "100%", marginTop: 4, padding: 6 }} onMouseLeave={() => setOpen(false)}>
          <div style={{ color: "var(--muted)", fontSize: 10, padding: "2px 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>back</div>
          <div style={{ display: "flex", gap: 2 }}>
            {jumps.map((n) => (
              <button key={`b${n}`} disabled={!canUndo} onClick={() => { onJumpBack(n); setOpen(false); }} style={{ flex: 1, fontSize: 10 }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 10, padding: "2px 4px", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>forward</div>
          <div style={{ display: "flex", gap: 2 }}>
            {jumps.map((n) => (
              <button key={`f${n}`} disabled={!canRedo} onClick={() => { onJumpForward(n); setOpen(false); }} style={{ flex: 1, fontSize: 10 }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function SelectionButton({
  maxColumn,
  onDelete,
  onDuplicate,
}: {
  maxColumn: number;
  onDelete: (lo: number, hi: number) => void;
  onDuplicate: (lo: number, hi: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  return (
    <span style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Operate on a column range">Select…</button>
      {open && (
        <div
          className="examples-picker__pop"
          style={{ width: 220, top: "100%", marginTop: 4, padding: 8 }}
          onMouseLeave={() => setOpen(false)}
        >
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>cols</span>
            <input
              type="number"
              min={0}
              max={maxColumn}
              value={from}
              onChange={(e) => setFrom(parseInt(e.target.value || "0", 10))}
              style={{ width: 56, fontSize: 11 }}
            />
            <span style={{ color: "var(--muted)" }}>–</span>
            <input
              type="number"
              min={0}
              max={maxColumn}
              value={to}
              onChange={(e) => setTo(parseInt(e.target.value || "0", 10))}
              style={{ width: 56, fontSize: 11 }}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => { onDuplicate(from, to); setOpen(false); }}>Duplicate</button>
            <button onClick={() => { if (window.confirm(`Delete gates in columns ${from}–${to}?`)) { onDelete(from, to); setOpen(false); } }}>Delete</button>
          </div>
        </div>
      )}
    </span>
  );
}

function RecordButton({ onRecord }: { onRecord: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onRecord(); } finally { setBusy(false); }
      }}
      disabled={busy}
      title="Record one period of the t-animation as a WebM video (3 s at 30 fps)"
    >
      {busy ? "Recording…" : "Record"}
    </button>
  );
}

/**
 * Single popover that consolidates the six "transform the circuit" actions —
 * Compact, Append U†, Optimise, Transpile…, Compile…, Route. Replaces a row
 * of six toolbar buttons with one menu so the toolbar fits on a normal
 * laptop screen even with all the new features.
 *
 * Transpile and Compile both want a target gate set; the popover shows
 * them as sub-rows. Route is only shown when a coupling map is imported.
 */
function TransformMenu({
  hasCoupling,
  onCompact,
  onAppendInverse,
  onOptimise,
  onTranspile,
  onCompile,
  onRoute,
}: {
  hasCoupling: boolean;
  onCompact: () => void;
  onAppendInverse: () => void;
  onOptimise: () => void;
  onTranspile: (t: TranspileTarget) => void;
  onCompile: (t: TranspileTarget) => void;
  onRoute: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const targets: Array<{ id: TranspileTarget; label: string; hint: string }> = [
    { id: "clifford-t", label: "Clifford + T", hint: "{H, S, T, CX}" },
    { id: "ibm-heavy-hex", label: "IBM heavy-hex", hint: "{RZ, SX, CX}" },
    { id: "rigetti", label: "Rigetti", hint: "{RZ, RX(±π/2), CZ}" },
  ];
  return (
    <span style={{ position: "relative" }} ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} title="Compact, Append U†, Optimise, Transpile, Compile, Route">
        Transform…
      </button>
      {open && (
        <div className="examples-picker__pop" style={{ width: 260, top: "100%", marginTop: 4 }}>
          <div className="examples-picker__list">
            <button className="examples-picker__item" onClick={() => { setOpen(false); onCompact(); }}>
              <span>Compact</span>
              <span className="export-picker__hint">ASAP-repack columns</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onAppendInverse(); }}>
              <span>Append U†</span>
              <span className="export-picker__hint">inverse of current circuit</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onOptimise(); }}>
              <span>Optimise</span>
              <span className="export-picker__hint">peephole rewrites</span>
            </button>
            <div className="examples-picker__cat-label">Transpile to native →</div>
            {targets.map((tg) => (
              <button
                key={`tp-${tg.id}`}
                className="examples-picker__item"
                onClick={() => { setOpen(false); onTranspile(tg.id); }}
              >
                <span>{tg.label}</span>
                <span className="export-picker__hint">{tg.hint}</span>
              </button>
            ))}
            <div className="examples-picker__cat-label">Compile (transpile + optimise + route) →</div>
            {targets.map((tg) => (
              <button
                key={`cp-${tg.id}`}
                className="examples-picker__item"
                onClick={() => { setOpen(false); onCompile(tg.id); }}
              >
                <span>{tg.label}</span>
                <span className="export-picker__hint">{tg.hint}</span>
              </button>
            ))}
            {hasCoupling && (
              <>
                <div className="examples-picker__cat-label">Route</div>
                <button className="examples-picker__item" onClick={() => { setOpen(false); onRoute(); }}>
                  <span>Insert SWAPs</span>
                  <span className="export-picker__hint">satisfy coupling map</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Draggable horizontal splitter between the canvas and the Inspector.
 * Drag up → Inspector grows; drag down → Inspector shrinks. The user's
 * choice persists in localStorage. We adjust the CSS custom property
 * `--inspector-h` on document.documentElement so a single rule on the
 * Inspector picks up the value without re-rendering anything.
 *
 * Bounded between 60 px (just the header) and 60% of viewport height.
 */
function InspectorSplitter() {
  const STORAGE_KEY = "quantiom:inspector-h";
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHRef = useRef(0);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(saved) && saved > 0) {
      document.documentElement.style.setProperty("--inspector-h", `${saved}px`);
    }
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startYRef.current = e.clientY;
    const current = getComputedStyle(document.documentElement).getPropertyValue("--inspector-h").trim();
    const px = parseInt(current.endsWith("px") ? current : "0", 10);
    startHRef.current = px || guessCurrentInspectorHeight();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = startYRef.current - e.clientY; // drag up = positive
    const next = clamp(startHRef.current + delta, 60, window.innerHeight * 0.6);
    document.documentElement.style.setProperty("--inspector-h", `${Math.round(next)}px`);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const current = getComputedStyle(document.documentElement).getPropertyValue("--inspector-h").trim();
    const px = parseInt(current.endsWith("px") ? current : "0", 10);
    if (px > 0) {
      try { localStorage.setItem(STORAGE_KEY, String(px)); } catch { /* ignore */ }
    }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="editor__splitter"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      title="Drag to resize the Inspector panel"
    />
  );
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function guessCurrentInspectorHeight(): number {
  const el = document.querySelector(".inspector") as HTMLElement | null;
  return el ? el.getBoundingClientRect().height : 200;
}

export function CircuitEditor() {
  const t = useTabs();
  const circuit = t.activeCircuit;
  const dispatch = t.circuitDispatch;
  const undoState = t.history;
  const { selectedGateId, pickedStep, paramValues } = t.ui;
  const setSelectedGateId = t.setSelected;
  const setPickedStep = t.setStep;
  const setParamValues = t.setParams;

  const [customGates, setCustomGates] = useState<CustomGate[]>(() => loadCustomGates());
  const [noise, setNoise] = useState<NoiseModel>(() => loadNoise());
  const [findQuery, setFindQuery] = useState<string>("");

  useEffect(() => {
    saveCustomGates(customGates);
  }, [customGates]);

  useEffect(() => {
    saveNoise(noise);
  }, [noise]);

  // Best-effort cleanup of the now-removed presentation-mode key so old
  // browsers don't carry around dead state.
  useEffect(() => {
    try { localStorage.removeItem("quantiom:presentation"); } catch { /* ignore */ }
  }, []);

  // Auto-load circuit from URL hash (#c=<gzip+base64url>) once on mount.
  // Opens shared links into a new tab so the user doesn't lose their work.
  useEffect(() => {
    let cancelled = false;
    decodeCircuitFromHash(location.hash).then((c) => {
      if (cancelled || !c) return;
      t.newTab(c, c.name ?? "Shared");
      // Clear the hash so a refresh doesn't reopen the tab again.
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveAsGate = () => {
    const name = window.prompt("Name for this gate?", circuit.name ?? "myblock");
    if (!name) return;
    if (circuit.gates.length === 0) {
      window.alert("Add at least one gate before saving as a custom gate.");
      return;
    }
    const cg: CustomGate = {
      id: newCustomGateId(),
      name: name.trim(),
      numQubits: circuit.numQubits,
      gates: circuit.gates.map((g) => ({ ...g })),
    };
    setCustomGates((prev) => [...prev, cg]);
  };

  const removeCustomGate = (id: string) => {
    setCustomGates((prev) => prev.filter((c) => c.id !== id));
  };

  // Step-through state. null means "follow the end of the circuit" — i.e.
  // the user hasn't picked a step explicitly, so the simulation reflects
  // every gate. A non-null number freezes the simulation at that column.
  const maxColumn = useMemo(
    () => circuit.gates.reduce((m, g) => Math.max(m, g.column), -1),
    [circuit.gates],
  );
  const effectiveStep = pickedStep === null ? maxColumn : Math.min(pickedStep, maxColumn);

  const steppedCircuit = useMemo(() => {
    if (pickedStep === null) return circuit;
    return { ...circuit, gates: circuit.gates.filter((g) => g.column <= effectiveStep) };
  }, [circuit, pickedStep, effectiveStep]);

  const simState = useStatevector(steppedCircuit, paramValues, customGates, noise);
  // Opt-in WebGPU fast path: only kicks in when noise is enabled and the
  // circuit is in the GPU-supported subset (1-qubit + depolarising only).
  // Falls back silently to the CPU result the moment any constraint fails.
  const gpuProbs = useGPUNoisyProbabilities(steppedCircuit, paramValues, customGates, noise, true);

  // For circuits with measurements: a single deterministic simulate() run
  // collapses to one classical branch and reports a pinned distribution.
  // Average |amp|² across N independent shots so Probabilities matches what
  // Measurement counts reports. The work is O(shots × circuit cost); the
  // dep array keeps this from refiring on every render.
  const SAMPLED_SHOTS = 1024;
  const hasMeasurements = useMemo(
    () => steppedCircuit.gates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [steppedCircuit],
  );
  const sampledProbs = useMemo<number[] | null>(() => {
    if (!hasMeasurements) return null;
    return sampleAveragedAmplitudeProbabilities(steppedCircuit, paramValues, customGates, SAMPLED_SHOTS);
  }, [hasMeasurements, steppedCircuit, paramValues, customGates]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      // Tab navigation: Cmd/Ctrl + 1..9 jumps to that tab; Cmd/Ctrl + T opens new.
      if (mod && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < t.tabs.length) {
          e.preventDefault();
          t.switchTab(t.tabs[idx].id);
          return;
        }
      }
      if (mod && e.key.toLowerCase() === "t" && !e.shiftKey) {
        e.preventDefault();
        t.newTab();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedGateId && !inField) {
        dispatch({ type: "remove-gate", id: selectedGateId });
        setSelectedGateId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, selectedGateId, setSelectedGateId, t]);

  return (
    <div className="editor">
      <header className="app__header">
        <div className="app__header-left">
          <h1>Quantiom</h1>
          <span className="app__version">v{APP_VERSION}.{__GIT_COMMITS__} ({__GIT_SHA__})</span>
          <span className="app__tagline">circuit editor · simulator · visualizer</span>
        </div>
        <div className="app__title">{circuit.name ?? "Untitled"}</div>
        <div className="app__header-right" />
      </header>
      <GatePalette customGates={customGates} onRemoveCustomGate={removeCustomGate} />
      <div className="editor__center">
        <TabStrip
          tabs={t.tabs}
          activeId={t.activeId}
          onSwitch={t.switchTab}
          onClose={t.closeTab}
          onReorder={t.reorderTab}
          onRename={t.renameTab}
          onNew={() => t.newTab()}
          onDuplicate={t.duplicateTab}
        />
        <div className="editor__toolbar">
          <div className="editor__counts">
            <button onClick={() => dispatch({ type: "remove-qubit" })} title="Remove last qubit">−</button>
            <span>{circuit.numQubits} qubits</span>
            <button onClick={() => dispatch({ type: "add-qubit" })} title="Add a qubit">+</button>
            <span className="editor__sep">·</span>
            <button onClick={() => dispatch({ type: "remove-clbit" })} title="Remove a classical bit">−</button>
            <span>{circuit.numClbits} clbits</span>
            <button onClick={() => dispatch({ type: "add-clbit" })} title="Add a classical bit">+</button>
          </div>
          <div className="editor__actions">
            <FileMenu circuit={circuit} dispatch={dispatch} onLoadInNewTab={(c, name) => t.newTab(c, name)} />
            <span className="editor__sep">·</span>
            <button
              onClick={() => dispatch({ type: "undo" })}
              disabled={!undoState.canUndo}
              title="Undo (⌘Z / Ctrl+Z)"
            >
              Undo
            </button>
            <button
              onClick={() => dispatch({ type: "redo" })}
              disabled={!undoState.canRedo}
              title="Redo (⇧⌘Z / Ctrl+Shift+Z)"
            >
              Redo
            </button>
            <HistoryButton
              canUndo={undoState.canUndo}
              canRedo={undoState.canRedo}
              onJumpBack={(n) => {
                for (let i = 0; i < n; i++) dispatch({ type: "undo" });
              }}
              onJumpForward={(n) => {
                for (let i = 0; i < n; i++) dispatch({ type: "redo" });
              }}
            />
            <button onClick={onSaveAsGate} title="Save the current circuit as a reusable custom gate">Save as gate</button>
            <input
              type="search"
              className="editor__find"
              placeholder="Find: gate / qN / param"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              title="Highlight gates by id, qubit (e.g. q3 or a name), or parameter substring"
              style={{ width: 200 }}
            />
            <TransformMenu
              hasCoupling={!!noise.coupling}
              onCompact={() => dispatch({ type: "compact-columns" })}
              onAppendInverse={() => {
                const maxCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1);
                if (maxCol < 0) return;
                const { inverted, skipped } = inverseGates(circuit, 0, maxCol);
                if (skipped.length > 0) {
                  const ok = window.confirm(
                    `${skipped.length} gate(s) could not be inverted (measurements / state prep / arbitrary unitary) and will be omitted. Continue?`,
                  );
                  if (!ok) return;
                }
                for (const g of inverted) dispatch({ type: "place-gate", gate: g });
              }}
              onOptimise={() => {
                const result = optimiseCircuit(circuit);
                if (result.before === result.after && Object.keys(result.rulesFired).length === 0) {
                  window.alert("No rewrites applied — circuit is already in fixed-point form.");
                  return;
                }
                t.newTab(result.circuit, result.circuit.name);
                const rulesText = Object.entries(result.rulesFired)
                  .map(([rule, n]) => `  ${rule}: ${n}×`)
                  .join("\n");
                window.alert(
                  `Optimised in ${result.passes} pass(es):\n` +
                  `  gates: ${result.before} → ${result.after}\n` +
                  (rulesText ? `\nRules fired:\n${rulesText}` : ""),
                );
              }}
              onTranspile={(target) => {
                const result = transpile(circuit, target);
                const label =
                  target === "clifford-t" ? "Clifford+T" : target === "ibm-heavy-hex" ? "IBM heavy-hex" : "Rigetti";
                if (result.skipped.length > 0) {
                  console.warn(`Transpile to ${target}: ${result.skipped.length} gates without a decomposition kept as-is`, result.skipped);
                }
                t.newTab(result.circuit, `${circuit.name ?? "Untitled"} → ${label}`);
                window.alert(
                  `Transpiled to ${label}:\n` +
                  `  gates: ${result.before.gates} → ${result.after.gates}\n` +
                  `  CX:    ${result.before.cx} → ${result.after.cx}\n` +
                  `  T:     ${result.before.tCount} → ${result.after.tCount}\n` +
                  `  depth: ${result.before.depth} → ${result.after.depth}` +
                  (result.skipped.length > 0 ? `\n  (${result.skipped.length} gates not decomposable to ${label})` : ""),
                );
              }}
              onCompile={(target) => {
                const result = compileForDevice(circuit, target, noise.coupling);
                const label =
                  target === "clifford-t" ? "Clifford+T" : target === "ibm-heavy-hex" ? "IBM heavy-hex" : "Rigetti";
                t.newTab(result.circuit, result.circuit.name);
                const stagesText = result.stages
                  .map((s) => `  ${s.name.padEnd(10)}: ${s.gates.toString().padStart(4)} gates, depth ${s.depth}`)
                  .join("\n");
                window.alert(
                  `Compiled to ${label}${noise.coupling ? " + routed" : ""}:\n` + stagesText,
                );
              }}
              onRoute={() => {
                if (!noise.coupling) return;
                const result = routeCircuit(circuit, noise.coupling);
                t.newTab(result.circuit, result.circuit.name);
                window.alert(
                  `Routed to coupling map:\n` +
                  `  violations:    ${result.violationsBefore}\n` +
                  `  SWAPs added:   ${result.swapsInserted}\n` +
                  `  total gates:   ${circuit.gates.length} → ${result.circuit.gates.length}`,
                );
              }}
            />
            {simState.kind === "ready" && simState.data.freeSymbols.includes("t") && (
              <RecordButton
                onRecord={async () => {
                  const baseName = (circuit.name ?? "circuit").toLowerCase().replace(/[^a-z0-9]+/g, "_") || "circuit";
                  try {
                    await recordAnimationWebM({
                      setParamValues,
                      currentParams: paramValues,
                      duration_ms: 3000,
                      fps: 30,
                      filename: `${baseName}.webm`,
                    });
                  } catch (e) {
                    window.alert(`Recording failed: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
              />
            )}
            <SelectionButton
              maxColumn={maxColumn}
              onDelete={(lo, hi) => dispatch({ type: "delete-range", fromColumn: lo, toColumn: hi })}
              onDuplicate={(lo, hi) => dispatch({ type: "duplicate-range", fromColumn: lo, toColumn: hi })}
            />
            <button onClick={() => dispatch({ type: "clear" })} title="Clear circuit">Clear</button>
          </div>
        </div>
        <StepBar maxColumn={maxColumn} step={effectiveStep} onChange={setPickedStep} />
        <div className="editor__canvas-scroll">
          <CircuitCanvas
            circuit={circuit}
            dispatch={dispatch}
            selectedGateId={selectedGateId}
            onSelect={setSelectedGateId}
            currentStep={effectiveStep}
            customGates={customGates}
            highlightedIds={findMatches(circuit, findQuery)}
          />
        </div>
        <InspectorSplitter />
        <Inspector
          circuit={circuit}
          dispatch={dispatch}
          selectedGateId={selectedGateId}
          onSelect={setSelectedGateId}
          onStepTo={setPickedStep}
        />
        <ErrorBoundary label="chat">
          <ChatPanel
            circuit={circuit}
            simResult={dataOf(simState)}
            noise={noise}
            onLoadInNewTab={(c, n) => t.newTab(c, n)}
          />
        </ErrorBoundary>
      </div>
      <div className="editor__right">
        <ErrorBoundary label="parameters">
          <ParameterPanel state={simState} values={paramValues} onChange={setParamValues} />
        </ErrorBoundary>
        <ErrorBoundary label="statevector"><StatevectorPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="measurement-counts">
          <MeasurementCountsPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="probabilities">
          <ProbabilityPanel
            state={simState}
            gpuProbabilities={gpuProbs}
            sampledProbabilities={sampledProbs}
            sampledShots={hasMeasurements ? SAMPLED_SHOTS : undefined}
          />
        </ErrorBoundary>
        <ErrorBoundary label="bloch"><BlochPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="phase-disk"><PhaseDiskPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="expectation">
          <ExpectationPanel
            state={simState}
            noisyContext={{
              circuit: steppedCircuit,
              paramValues,
              customGates,
              noise,
              onParamChange: setParamValues,
            }}
          />
        </ErrorBoundary>
        <ErrorBoundary label="density"><DensityPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="noise"><NoisePanel noise={noise} onChange={setNoise} /></ErrorBoundary>
        <ErrorBoundary label="resources"><ResourcePanel circuit={circuit} coupling={noise.coupling} /></ErrorBoundary>
        <ErrorBoundary label="compare">
          <ComparePanel
            currentTabId={t.activeId}
            tabs={t.tabs.map((x) => ({
              id: x.id,
              name: x.versioned.present.name ?? "Untitled",
              circuit: x.versioned.present,
            }))}
          />
        </ErrorBoundary>
        <ErrorBoundary label="equivalence">
          <EquivalencePanel
            circuit={circuit}
            customGates={customGates}
            paramValues={paramValues}
            otherTabs={t.tabs
              .filter((x) => x.id !== t.activeId)
              .map((x) => ({
                id: x.id,
                label: x.versioned.present.name ?? "Untitled",
                circuit: x.versioned.present,
              }))}
          />
        </ErrorBoundary>
        <ErrorBoundary label="syndromes">
          <SyndromePanel circuit={circuit} customGates={customGates} noise={noise} />
        </ErrorBoundary>
        <ErrorBoundary label="tomography">
          <TomographyPanel circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>
        <ErrorBoundary label="hamiltonian">
          <HamiltonianPanel onLoadInNewTab={(c, n) => t.newTab(c, n)} />
        </ErrorBoundary>
        <ErrorBoundary label="qasm"><QasmPanel circuit={circuit} dispatch={dispatch} /></ErrorBoundary>
      </div>
    </div>
  );
}

