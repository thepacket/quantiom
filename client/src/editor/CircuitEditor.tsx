import { useEffect, useMemo, useRef, useState } from "react";
import { version as APP_VERSION } from "../../package.json";
import { useTabs } from "./tabs";
import { TabStrip } from "./TabStrip";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { DocsModal } from "./DocsModal";
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
import { parseQasm3 } from "../qasm/parse";
import { emitQasm3 } from "../qasm/emit";
import { inverseGates } from "./inverse";
import { transpile, type TranspileTarget } from "../sim/transpile";
import { routeCircuit } from "../sim/router";
import { optimiseCircuit } from "../sim/optimisePasses";
import { randomCliffordCircuit } from "../sim/randomClifford";
import { compileForDevice } from "../sim/compile";
import { recordAnimationWebM } from "./recordAnimation";
import { StatevectorPanel } from "../panels/StatevectorPanel";
import { QasmPanel } from "../panels/QasmPanel";
import { ProbabilityPanel } from "../panels/ProbabilityPanel";
import { BlochPanel } from "../panels/BlochPanel";
import { ExpectationPanel } from "../panels/ExpectationPanel";
import { DensityPanel } from "../panels/DensityPanel";
import { MutualInfoPanel } from "../panels/MutualInfoPanel";
import { SpaceTimePanel } from "../panels/SpaceTimePanel";
import { SchmidtPanel } from "../panels/SchmidtPanel";
import { CorrelationPanel } from "../panels/CorrelationPanel";
import { TSweepPanel } from "../panels/TSweepPanel";
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

/** localStorage key for the cross-tab gate-rectangle clipboard. Holds the
 *  serialised slice for Copy/Cut/Paste Selection on the canvas. */
const GATE_CLIPBOARD_KEY = "quantiom:clipboard:v1";

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
      style={{
        background: "var(--accent-2)",
        color: "#0d0e10",
        borderColor: "var(--accent-2)",
        fontWeight: 600,
      }}
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
  onRandomClifford,
}: {
  hasCoupling: boolean;
  onCompact: () => void;
  onAppendInverse: () => void;
  onOptimise: (deep: boolean) => void;
  onTranspile: (t: TranspileTarget) => void;
  onCompile: (t: TranspileTarget) => void;
  onRoute: () => void;
  onRandomClifford: () => void;
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
        <div className="examples-picker__pop" style={{ top: "100%", marginTop: 4 }}>
          <div className="examples-picker__list">
            <button className="examples-picker__item" onClick={() => { setOpen(false); onCompact(); }}>
              <span>Compact</span>
              <span className="export-picker__hint">ASAP-repack columns</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onAppendInverse(); }}>
              <span>Append U†</span>
              <span className="export-picker__hint">inverse of current circuit</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onOptimise(false); }}>
              <span>Optimise</span>
              <span className="export-picker__hint">peephole rewrites (safe)</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onOptimise(true); }}>
              <span>Optimise (deep)</span>
              <span className="export-picker__hint">+ commute-through-diagonals; may reflow layout</span>
            </button>
            <button className="examples-picker__item" onClick={() => { setOpen(false); onRandomClifford(); }}>
              <span>Random Clifford…</span>
              <span className="export-picker__hint">new tab; tableau fast-path test</span>
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
 * Edit menu — groups undo / redo (and future range editing entries) into
 * one dropdown. Sits to the right of File in the top toolbar. Keyboard
 * shortcuts (⌘Z / ⇧⌘Z) remain the primary path; this menu is for
 * discoverability + a stable home for clipboard-style operations.
 */
function EditMenu({
  canUndo, canRedo, onUndo, onRedo,
  selectionSize, onCopySelection, onCutSelection, onPasteSelection, hasGateClipboard,
  onCopyCircuit, onPasteCircuit, onDuplicateTab, onClear,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectionSize: number;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onPasteSelection: () => void;
  hasGateClipboard: boolean;
  onCopyCircuit: () => void;
  onPasteCircuit: () => void;
  onDuplicateTab: () => void;
  onClear: () => void;
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
  return (
    <span style={{ position: "relative" }} ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} title="Undo, redo">
        Edit
      </button>
      {open && (
        <div className="examples-picker__pop" style={{ top: "100%", marginTop: 4 }}>
          <div className="examples-picker__list">
            <button
              className="examples-picker__item"
              disabled={!canUndo}
              onClick={() => { setOpen(false); onUndo(); }}
            >
              <span>Undo</span>
              <span className="export-picker__hint">⌘Z / Ctrl+Z</span>
            </button>
            <button
              className="examples-picker__item"
              disabled={!canRedo}
              onClick={() => { setOpen(false); onRedo(); }}
            >
              <span>Redo</span>
              <span className="export-picker__hint">⇧⌘Z / Ctrl+Shift+Z</span>
            </button>
            <div className="examples-picker__cat-label">Clipboard</div>
            <button
              className="examples-picker__item"
              onClick={() => { setOpen(false); onCopyCircuit(); }}
            >
              <span>Copy Circuit</span>
              <span className="export-picker__hint">current circuit as QASM 3 → clipboard</span>
            </button>
            <button
              className="examples-picker__item"
              onClick={() => { setOpen(false); onPasteCircuit(); }}
            >
              <span>Paste Circuit</span>
              <span className="export-picker__hint">QASM in clipboard → new tab</span>
            </button>
            <div className="examples-picker__cat-label">Selection</div>
            <button
              className="examples-picker__item"
              disabled={selectionSize === 0}
              onClick={() => { setOpen(false); onCopySelection(); }}
            >
              <span>Copy Selection</span>
              <span className="export-picker__hint">{selectionSize === 0 ? "drag a rectangle on the canvas first" : `${selectionSize} gate(s) → gate clipboard`}</span>
            </button>
            <button
              className="examples-picker__item"
              disabled={selectionSize === 0}
              onClick={() => { setOpen(false); onCutSelection(); }}
            >
              <span>Cut Selection</span>
              <span className="export-picker__hint">{selectionSize === 0 ? "drag a rectangle on the canvas first" : `${selectionSize} gate(s) → gate clipboard, removed`}</span>
            </button>
            <button
              className="examples-picker__item"
              disabled={!hasGateClipboard}
              onClick={() => { setOpen(false); onPasteSelection(); }}
            >
              <span>Paste Selection</span>
              <span className="export-picker__hint">{hasGateClipboard ? "append clipboard gates after the circuit" : "gate clipboard is empty"}</span>
            </button>
            <div className="examples-picker__cat-label">Circuit</div>
            <button
              className="examples-picker__item"
              onClick={() => { setOpen(false); onDuplicateTab(); }}
            >
              <span>Duplicate</span>
              <span className="export-picker__hint">copy current tab into a new one</span>
            </button>
            <button
              className="examples-picker__item"
              onClick={() => { setOpen(false); onClear(); }}
            >
              <span>Clear</span>
              <span className="export-picker__hint">remove all gates from the current tab</span>
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Help menu — opens the DocsModal on a specific tab. Last entry on the
 * toolbar. Add new doc tabs to DocsModal's TABS list and surface them
 * here so users find them.
 */
function HelpMenu({ onOpen }: { onOpen: (tabId: string) => void }) {
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
  const items: Array<{ id: string; label: string; hint: string }> = [
    { id: "tutorial", label: "Tutorial", hint: "hands-on Bell → VQE walkthrough" },
    { id: "panels", label: "Panel reference", hint: "what every right-side panel shows" },
    { id: "architecture", label: "Architecture", hint: "codebase map: where things live, how they connect" },
    { id: "qasm", label: "OpenQASM & export", hint: "round-trip rules + the eight code emitters" },
  ];
  return (
    <span style={{ position: "relative" }} ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} title="Tutorials and reference documentation">
        Help
      </button>
      {open && (
        <div className="examples-picker__pop" style={{ top: "100%", marginTop: 4 }}>
          <div className="examples-picker__list">
            {items.map((it) => (
              <button
                key={it.id}
                className="examples-picker__item"
                onClick={() => { setOpen(false); onOpen(it.id); }}
              >
                <span>{it.label}</span>
                <span className="export-picker__hint">{it.hint}</span>
              </button>
            ))}
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [gateClipboardVersion, setGateClipboardVersion] = useState(0);
  const hasGateClipboard = useMemo(() => {
    void gateClipboardVersion;
    try { return !!localStorage.getItem(GATE_CLIPBOARD_KEY); } catch { return false; }
  }, [gateClipboardVersion]);
  // Reset rubber-band selection when switching tabs — it's a per-tab UI
  // state, like selectedGateId, and stale ids would refer to gates that
  // belong to a different circuit.
  useEffect(() => { setSelectedIds(new Set()); }, [t.activeId]);
  const [customGates, setCustomGates] = useState<CustomGate[]>(() => loadCustomGates());
  const [noise, setNoise] = useState<NoiseModel>(() => loadNoise());
  const [findQuery, setFindQuery] = useState<string>("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDocs, setShowDocs] = useState<null | string>(null);

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
  const gpuResult = useGPUNoisyProbabilities(steppedCircuit, paramValues, customGates, noise, true);
  const gpuProbs = gpuResult?.probabilities ?? null;
  const gpuBloch = gpuResult?.blochVectors ?? null;

  // Auto shot-batches timer. When enabled, a setInterval at the chosen
  // rate increments `shotsTick`, which is threaded into every shot-based
  // panel's sampling deps so they re-run on each tick.
  const SHOTS_RATES = [1, 5, 10, 20, 40, 60] as const;
  const [autoShots, setAutoShots] = useState<boolean>(() => {
    try { return localStorage.getItem("quantiom:autoshots:on") === "1"; } catch { return false; }
  });
  const [shotsRate, setShotsRate] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem("quantiom:autoshots:rate") ?? "", 10);
      return SHOTS_RATES.includes(v as 1 | 5 | 10 | 20 | 40 | 60) ? v : 1;
    } catch { return 1; }
  });
  const [shotsTick, setShotsTick] = useState(0);
  useEffect(() => {
    try { localStorage.setItem("quantiom:autoshots:on", autoShots ? "1" : "0"); } catch { /* ignore */ }
  }, [autoShots]);
  useEffect(() => {
    try { localStorage.setItem("quantiom:autoshots:rate", String(shotsRate)); } catch { /* ignore */ }
  }, [shotsRate]);
  useEffect(() => {
    if (!autoShots || shotsRate <= 0) return;
    const id = window.setInterval(() => setShotsTick((t) => t + 1), Math.round(1000 / shotsRate));
    return () => window.clearInterval(id);
  }, [autoShots, shotsRate]);

  // For circuits with measurements: a single deterministic simulate() run
  // collapses to one classical branch and reports a pinned distribution.
  // Average |amp|² across N independent shots so Probabilities matches what
  // Measurement counts reports. The work is O(shots × circuit cost); the
  // dep array keeps this from refiring on every render. `shotsTick` is in
  // the dep array so the auto-shot timer pulls a fresh sample on each tick.
  const SAMPLED_SHOTS = 1024;
  const hasMeasurements = useMemo(
    () => steppedCircuit.gates.some((g) => g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y"),
    [steppedCircuit],
  );
  const sampledProbs = useMemo<number[] | null>(() => {
    if (!hasMeasurements) return null;
    return sampleAveragedAmplitudeProbabilities(steppedCircuit, paramValues, customGates, SAMPLED_SHOTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMeasurements, steppedCircuit, paramValues, customGates, shotsTick]);

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
      // "?" pops the shortcuts dialog. Don't fire while typing in a field
      // (otherwise it eats a literal ? in a Find query or QASM).
      if (e.key === "?" && !inField && !e.metaKey && !e.ctrlKey) {
        setShowShortcuts(true);
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, selectedGateId, setSelectedGateId, t]);

  // Drag-and-drop QASM (.qasm/.qasm3) and JSON IR (.json) imports onto the
  // editor. Each dropped file opens in its own new tab. Falls back to a
  // plain alert on parse failure; the user already has the file on disk.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      const hasFiles = Array.from(e.dataTransfer.items ?? []).some((it) => it.kind === "file");
      if (!hasFiles) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = async (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      for (const f of files) {
        const name = f.name.replace(/\.(qasm3?|json)$/i, "");
        const text = await f.text();
        if (/\.json$/i.test(f.name)) {
          try {
            const data = JSON.parse(text);
            if (
              data && typeof data === "object"
              && typeof data.numQubits === "number"
              && Array.isArray(data.gates)
            ) {
              t.newTab({ ...data, name }, name);
              continue;
            }
            window.alert(`Drop failed: ${f.name} doesn't look like a Quantiom JSON IR.`);
          } catch {
            window.alert(`Drop failed: ${f.name} isn't valid JSON.`);
          }
          continue;
        }
        // Treat anything else as QASM (lenient — OpenQASM files have varied extensions).
        const result = parseQasm3(text);
        if (!result.ok) {
          window.alert(`Drop failed parsing ${f.name} (line ${result.line}): ${result.error}`);
          continue;
        }
        t.newTab({ ...result.circuit, name }, name);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [t]);

  return (
    <div className="editor">
      {showDocs !== null && <DocsModal initialTab={showDocs} onClose={() => setShowDocs(null)} />}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: 6, padding: 18, minWidth: 360, maxWidth: 520,
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 14 }}>Keyboard shortcuts</h2>
            <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Cmd/Ctrl + Z</td><td>Undo</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Shift + Cmd/Ctrl + Z</td><td>Redo</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Cmd/Ctrl + Y</td><td>Redo</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Cmd/Ctrl + T</td><td>New tab</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Cmd/Ctrl + 1..9</td><td>Switch to tab N</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Delete / Backspace</td><td>Remove selected gate</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>?</td><td>Open this dialog</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Esc</td><td>Close this dialog</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>drag-drop</td><td>Open .qasm or .json IR files</td></tr>
                <tr><td style={{ padding: "3px 12px 3px 0", color: "var(--muted)" }}>Enter (chat)</td><td>Send prompt; Shift+Enter newline</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
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
        />
        <div className="editor__toolbar">
          <div className="editor__actions">
            <FileMenu circuit={circuit} dispatch={dispatch} onLoadInNewTab={(c, name) => t.newTab(c, name)} />
            <EditMenu
              canUndo={undoState.canUndo}
              canRedo={undoState.canRedo}
              onUndo={() => dispatch({ type: "undo" })}
              onRedo={() => dispatch({ type: "redo" })}
              onCopyCircuit={async () => {
                try {
                  await navigator.clipboard.writeText(emitQasm3(circuit));
                } catch (e) {
                  window.alert(`Clipboard write failed: ${e instanceof Error ? e.message : String(e)}`);
                }
              }}
              onPasteCircuit={async () => {
                let text: string;
                try {
                  text = await navigator.clipboard.readText();
                } catch (e) {
                  window.alert(`Clipboard read failed: ${e instanceof Error ? e.message : String(e)}`);
                  return;
                }
                if (!text.trim()) {
                  window.alert("Clipboard is empty.");
                  return;
                }
                const result = parseQasm3(text);
                if (!result.ok) {
                  window.alert(`Parse error on line ${result.line}: ${result.error}`);
                  return;
                }
                t.newTab(result.circuit, "Pasted");
              }}
              selectionSize={selectedIds.size}
              hasGateClipboard={hasGateClipboard}
              onCopySelection={() => {
                const selected = circuit.gates.filter((g) => selectedIds.has(g.id));
                if (selected.length === 0) return;
                const minCol = Math.min(...selected.map((g) => g.column));
                const slice = selected.map((g) => ({
                  gateId: g.gateId,
                  controls: g.controls,
                  targets: g.targets,
                  clbits: g.clbits,
                  params: g.params,
                  column: g.column - minCol,
                  controlStates: g.controlStates,
                  condition: g.condition,
                  annotation: g.annotation,
                }));
                try {
                  localStorage.setItem(GATE_CLIPBOARD_KEY, JSON.stringify(slice));
                  setGateClipboardVersion((v) => v + 1);
                } catch { /* quota — silently drop */ }
              }}
              onCutSelection={() => {
                const selected = circuit.gates.filter((g) => selectedIds.has(g.id));
                if (selected.length === 0) return;
                const minCol = Math.min(...selected.map((g) => g.column));
                const slice = selected.map((g) => ({
                  gateId: g.gateId,
                  controls: g.controls,
                  targets: g.targets,
                  clbits: g.clbits,
                  params: g.params,
                  column: g.column - minCol,
                  controlStates: g.controlStates,
                  condition: g.condition,
                  annotation: g.annotation,
                }));
                try {
                  localStorage.setItem(GATE_CLIPBOARD_KEY, JSON.stringify(slice));
                  setGateClipboardVersion((v) => v + 1);
                } catch { /* quota — silently drop */ }
                for (const g of selected) dispatch({ type: "remove-gate", id: g.id });
                setSelectedIds(new Set());
              }}
              onPasteSelection={() => {
                let raw: string | null = null;
                try { raw = localStorage.getItem(GATE_CLIPBOARD_KEY); } catch { /* ignore */ }
                if (!raw) return;
                let slice: Array<Omit<import("./types").PlacedGate, "id"> & { column: number }>;
                try { slice = JSON.parse(raw); } catch { return; }
                const atColumn = circuit.gates.reduce((m, g) => Math.max(m, g.column + 1), 0);
                for (const s of slice) {
                  const allQs = [...(s.controls ?? []), ...(s.targets ?? [])];
                  if (allQs.some((q) => q < 0 || q >= circuit.numQubits)) continue;
                  if ((s.clbits ?? []).some((c) => c < 0 || c >= circuit.numClbits)) continue;
                  dispatch({
                    type: "place-gate",
                    gate: {
                      ...s,
                      id: `paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                      column: atColumn + s.column,
                    },
                  });
                }
              }}
              onDuplicateTab={() => t.duplicateTab(t.activeId)}
              onClear={() => dispatch({ type: "clear" })}
            />
            <span className="editor__sep">·</span>
            <button onClick={onSaveAsGate} title="Save the current circuit as a reusable custom gate">Save as Gate</button>
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
              onOptimise={(deep) => {
                const result = optimiseCircuit(circuit, { deep });
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
              onRandomClifford={() => {
                const raw = window.prompt(
                  "Random Clifford circuit — enter qubits, depth (e.g. \"6, 30\")",
                  `${Math.max(circuit.numQubits, 4)}, 30`,
                );
                if (!raw) return;
                const parts = raw.split(/[, ]+/).map((s) => parseInt(s.trim(), 10));
                const n = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 4;
                const depth = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : 30;
                if (n > 1024) {
                  window.alert("Max 1024 qubits (stabilizer cap).");
                  return;
                }
                const c = randomCliffordCircuit({ numQubits: n, depth });
                t.newTab(c, c.name);
              }}
            />
            <button
              onClick={() => {
                // Append a measure gate on every qubit. Auto-allocate clbits
                // when there aren't enough. Place all in the same column,
                // immediately after the highest existing column.
                const n = circuit.numQubits;
                if (n === 0) return;
                const needClbits = n - circuit.numClbits;
                for (let i = 0; i < needClbits; i++) dispatch({ type: "add-clbit" });
                const startCol = circuit.gates.reduce((m, g) => Math.max(m, g.column), -1) + 1;
                for (let q = 0; q < n; q++) {
                  dispatch({
                    type: "place-gate",
                    gate: {
                      id: `m_${Date.now()}_${q}`,
                      gateId: "measure",
                      controls: [],
                      targets: [q],
                      clbits: [q],
                      params: [],
                      column: startCol,
                    },
                  });
                }
              }}
              title="Append a measure on every qubit (auto-allocates classical bits)"
            >
              Measure All
            </button>
            <HelpMenu onOpen={(tabId) => setShowDocs(tabId)} />
          </div>
          <div className="editor__counts">
            <button onClick={() => dispatch({ type: "remove-qubit" })} title="Remove last qubit">−</button>
            <span>{circuit.numQubits} qubits</span>
            <button onClick={() => dispatch({ type: "add-qubit" })} title="Add a qubit">+</button>
            <span className="editor__sep">·</span>
            <button onClick={() => dispatch({ type: "remove-clbit" })} title="Remove a classical bit">−</button>
            <span>{circuit.numClbits} clbits</span>
            <button onClick={() => dispatch({ type: "add-clbit" })} title="Add a classical bit">+</button>
            <span className="editor__sep">·</span>
            <input
              type="search"
              className="editor__find"
              placeholder="Find: gate / qN / param"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              title="Highlight gates by id, qubit (e.g. q3 or a name), or parameter substring"
              style={{ width: 200 }}
            />
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
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
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
        <div className="editor__right-bar">
          <label className="editor__right-bar-toggle" title="When on, every panel with shot-based sampling re-runs on each tick.">
            <input
              type="checkbox"
              checked={autoShots}
              onChange={(e) => setAutoShots(e.target.checked)}
            />
            <span>auto shots</span>
          </label>
          <select
            value={shotsRate}
            onChange={(e) => setShotsRate(parseInt(e.target.value, 10))}
            disabled={!autoShots}
            title="Re-sample rate (per second)"
          >
            {SHOTS_RATES.map((r) => (
              <option key={r} value={r}>{r}/s</option>
            ))}
          </select>
          {autoShots && (
            <span className="editor__right-bar-tick" title={`tick ${shotsTick}`}>● {shotsTick}</span>
          )}
          {simState.kind === "ready" && simState.data.freeSymbols.includes("t") && (
            <RecordButton
              onRecord={async () => {
                const baseName = (circuit.name ?? "circuit").toLowerCase().replace(/[^a-z0-9]+/g, "_") || "circuit";
                const target = document.querySelector(".editor__right");
                if (!target) {
                  window.alert("Right panel column not found.");
                  return;
                }
                try {
                  await recordAnimationWebM({
                    target,
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
        </div>
        <ErrorBoundary label="parameters">
          <ParameterPanel state={simState} values={paramValues} onChange={setParamValues} />
        </ErrorBoundary>
        <ErrorBoundary label="statevector"><StatevectorPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="measurement-counts">
          <MeasurementCountsPanel circuit={circuit} customGates={customGates} paramValues={paramValues} shotsTick={shotsTick} />
        </ErrorBoundary>
        <ErrorBoundary label="probabilities">
          <ProbabilityPanel
            state={simState}
            gpuProbabilities={gpuProbs}
            sampledProbabilities={sampledProbs}
            sampledShots={hasMeasurements ? SAMPLED_SHOTS : undefined}
            shotsTick={shotsTick}
          />
        </ErrorBoundary>
        <ErrorBoundary label="bloch"><BlochPanel state={simState} gpuBlochVectors={gpuBloch} /></ErrorBoundary>
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
        <ErrorBoundary label="mutual-info"><MutualInfoPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="schmidt"><SchmidtPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="correlations"><CorrelationPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="space-time">
          <SpaceTimePanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="t-sweep">
          <TSweepPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
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
          <SyndromePanel circuit={circuit} customGates={customGates} noise={noise} shotsTick={shotsTick} />
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

