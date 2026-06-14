import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { version as APP_VERSION } from "../../package.json";
import { useTabs } from "./tabs";
import { TabStrip } from "./TabStrip";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { DocsModal } from "./DocsModal";
import { AboutModal } from "./AboutModal";
import { SelfTestModal } from "./SelfTestModal";
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
import { EndiannessToggle } from "../panels/endianness";
import { setAllPanelsCollapsed, SpotlightProvider, SPOTLIGHT_DND_MIME, PANEL_COLUMN_REVEAL_EVENT } from "../panels/PanelShell";
import { HoverTip } from "./HoverTip";
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
import { EntropyProfilePanel } from "../panels/EntropyProfilePanel";
import { SpaceTimeEntropyPanel } from "../panels/SpaceTimeEntropyPanel";
import { AmplitudePhasePanel } from "../panels/AmplitudePhasePanel";
import { UnitaryHeatmapPanel } from "../panels/UnitaryHeatmapPanel";
import { InteractionGraphPanel } from "../panels/InteractionGraphPanel";
import { TSweepFFTPanel } from "../panels/TSweepFFTPanel";
import { WignerPanel } from "../panels/WignerPanel";
import { MagicPanel } from "../panels/MagicPanel";
import { NegativityPanel } from "../panels/NegativityPanel";
import { ConcurrencePanel } from "../panels/ConcurrencePanel";
import { QfiPanel } from "../panels/QfiPanel";
import { QgtPanel } from "../panels/QgtPanel";
import { SymmetrySectorsPanel } from "../panels/SymmetrySectorsPanel";
import { ParticipationPanel } from "../panels/ParticipationPanel";
import { StructureFactorPanel } from "../panels/StructureFactorPanel";
import { KrylovPanel } from "../panels/KrylovPanel";
import { OperatorEntanglementPanel } from "../panels/OperatorEntanglementPanel";
import { AsymmetryPanel } from "../panels/AsymmetryPanel";
import { LoschmidtPanel } from "../panels/LoschmidtPanel";
import { PTMPanel } from "../panels/PTMPanel";
import { BlochTrajectoryPanel } from "../panels/BlochTrajectoryPanel";
import { OtocPanel } from "../panels/OtocPanel";
import { HamSpectrumPanel } from "../panels/HamSpectrumPanel";
import { DiagonalEnsemblePanel } from "../panels/DiagonalEnsemblePanel";
import { SpectralFormFactorPanel } from "../panels/SpectralFormFactorPanel";
import { LevelStatisticsPanel } from "../panels/LevelStatisticsPanel";
import { TannerPanel } from "../panels/TannerPanel";
import { StabilizerTableauPanel } from "../panels/StabilizerTableauPanel";
import { QSpherePanel } from "../panels/QSpherePanel";
import { HusimiPanel } from "../panels/HusimiPanel";
import { ZXPanel } from "../panels/ZXPanel";
import { LightConePanel, type ConeDir } from "../panels/LightConePanel";
import { computeLightCone } from "./lightcone";
import { NoisePanel } from "../panels/NoisePanel";
import { PhaseDiskPanel } from "../panels/PhaseDiskPanel";
import { ResourcePanel } from "../panels/ResourcePanel";
import { ComparePanel } from "../panels/ComparePanel";
import { ChatPanel } from "../panels/ChatPanel";
import { EquivalencePanel } from "../panels/EquivalencePanel";
import { PageCurvePanel } from "../panels/PageCurvePanel";
import { TripartiteInfoPanel } from "../panels/TripartiteInfoPanel";
import { EntanglementHamiltonianPanel } from "../panels/EntanglementHamiltonianPanel";
import { CountingStatisticsPanel } from "../panels/CountingStatisticsPanel";
import { SpinSqueezingPanel } from "../panels/SpinSqueezingPanel";
import { ObservableVariancePanel } from "../panels/ObservableVariancePanel";
import { CharacteristicFunctionPanel } from "../panels/CharacteristicFunctionPanel";
import { ImbalancePanel } from "../panels/ImbalancePanel";
import { ButterflyVelocityPanel } from "../panels/ButterflyVelocityPanel";
import { DensityOfStatesPanel } from "../panels/DensityOfStatesPanel";
import { BerryPhasePanel } from "../panels/BerryPhasePanel";
import { SyndromePanel } from "../panels/SyndromePanel";
import { RbPanel } from "../panels/RbPanel";
import { QecPanel } from "../panels/QecPanel";
import { QvPanel } from "../panels/QvPanel";
import { MirrorPanel } from "../panels/MirrorPanel";
import { XebPanel } from "../panels/XebPanel";
import { CrosstalkPanel } from "../panels/CrosstalkPanel";
import { T1T2Panel } from "../panels/T1T2Panel";
import { PauliBudgetPanel } from "../panels/PauliBudgetPanel";
import { MeasurementCountsPanel } from "../panels/MeasurementCountsPanel";
import { BranchTreePanel } from "../panels/BranchTreePanel";
import { DecoherencePanel } from "../panels/DecoherencePanel";
import { FidelityPanel } from "../panels/FidelityPanel";
import { ReadoutMitigationPanel } from "../panels/ReadoutMitigationPanel";
import { ClassicalShadowsPanel } from "../panels/ClassicalShadowsPanel";
import { StatePrepPanel } from "../panels/StatePrepPanel";
import { UnitarySynthPanel } from "../panels/UnitarySynthPanel";
import { CoherencePanel } from "../panels/CoherencePanel";
import { sampleAveragedAmplitudeProbabilities } from "../sim/measurementShots";
import { TomographyPanel } from "../panels/TomographyPanel";
import { HamiltonianPanel } from "../panels/HamiltonianPanel";
import { ParameterPanel } from "../panels/ParameterPanel";
import { CustomPlotPanel } from "../panels/CustomPlotPanel";
import { ErrorBoundary } from "../panels/ErrorBoundary";
import { useStatevector, dataOf } from "../panels/useSimulation";
import { SNIPPETS, type Snippet } from "./snippets";
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
  onRepeatSelection, onFoldSelection, onInsertSnippet, snippets, snippetMinOK,
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
  onRepeatSelection: () => void;
  onFoldSelection: () => void;
  onInsertSnippet: (s: Snippet) => void;
  snippets: Snippet[];
  snippetMinOK: (min: number) => boolean;
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
            <button
              className="examples-picker__item"
              disabled={selectionSize === 0}
              onClick={() => { setOpen(false); onRepeatSelection(); }}
            >
              <span>Repeat Selection ×N…</span>
              <span className="export-picker__hint">{selectionSize === 0 ? "select columns first" : "append N copies — ansatz / Trotter layers"}</span>
            </button>
            <button
              className="examples-picker__item"
              disabled={selectionSize === 0}
              onClick={() => { setOpen(false); onFoldSelection(); }}
            >
              <span>Fold Selection</span>
              <span className="export-picker__hint">{selectionSize === 0 ? "select columns first" : "collapse columns into a box (click to expand)"}</span>
            </button>
            <div className="examples-picker__cat-label">Insert block</div>
            {snippets.map((s) => (
              <button
                key={s.id}
                className="examples-picker__item"
                disabled={!snippetMinOK(s.minQubits)}
                onClick={() => { setOpen(false); onInsertSnippet(s); }}
              >
                <span>{s.label}</span>
                <span className="export-picker__hint">{snippetMinOK(s.minQubits) ? s.hint : `needs ≥ ${s.minQubits} qubits`}</span>
              </button>
            ))}
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
    { id: "precision", label: "Precision & limits", hint: "per-panel qubit caps + sampling / approximation caveats" },
  ];
  return (
    <span style={{ position: "relative" }} ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} title="Tutorials and reference documentation">
        Help
      </button>
      {open && (
        <div className="examples-picker__pop" style={{ top: "100%", marginTop: 4 }}>
          <div className="examples-picker__list">
            <a
              className="examples-picker__item"
              href="https://www.youtube.com/watch?v=tsbCSkvHhMo"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <span>Introduction to Quantum Computing</span>
            </a>
            <div className="examples-picker__cat-label">Reference →</div>
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
            <div className="examples-picker__cat-label">Community →</div>
            <a
              className="examples-picker__item"
              href="https://github.com/thepacket/quantiom/discussions"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <span>Discussions</span>
              <span className="export-picker__hint">ask questions &amp; share on GitHub</span>
            </a>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Draggable vertical splitter between the circuit canvas and the Inspector
 * side panel. Drag left → Inspector grows; drag right → Inspector shrinks.
 * The user's choice persists in localStorage. We adjust the CSS custom
 * property `--inspector-w` on document.documentElement so a single rule on
 * the Inspector picks up the value without re-rendering anything.
 *
 * Bounded between 200 px and 60% of the viewport width.
 */
function InspectorSplitter() {
  const STORAGE_KEY = "quantiom:inspector-w";
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(saved) && saved > 0) {
      document.documentElement.style.setProperty("--inspector-w", `${saved}px`);
    }
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    const current = getComputedStyle(document.documentElement).getPropertyValue("--inspector-w").trim();
    const px = parseInt(current.endsWith("px") ? current : "0", 10);
    startWRef.current = px || guessCurrentInspectorWidth();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = startXRef.current - e.clientX; // drag left = wider
    const next = clamp(startWRef.current + delta, 200, window.innerWidth * 0.6);
    document.documentElement.style.setProperty("--inspector-w", `${Math.round(next)}px`);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const current = getComputedStyle(document.documentElement).getPropertyValue("--inspector-w").trim();
    const px = parseInt(current.endsWith("px") ? current : "0", 10);
    if (px > 0) {
      try { localStorage.setItem(STORAGE_KEY, String(px)); } catch { /* ignore */ }
    }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="editor__vsplitter"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      title="Drag to resize the Inspector panel"
    />
  );
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function guessCurrentInspectorWidth(): number {
  const el = document.querySelector(".inspector") as HTMLElement | null;
  return el ? el.getBoundingClientRect().width : 300;
}

/** Vertical splitter between the spotlight dock (left) and the circuit. Drag
 *  right → the enlarged panel grows. Width persists in `--spotlight-w`. */
function SpotlightSplitter() {
  const STORAGE_KEY = "quantiom:spotlight-w";
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  useEffect(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
    if (Number.isFinite(saved) && saved > 0) document.documentElement.style.setProperty("--spotlight-w", `${saved}px`);
  }, []);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    const cur = getComputedStyle(document.documentElement).getPropertyValue("--spotlight-w").trim();
    const px = parseInt(cur.endsWith("px") ? cur : "0", 10);
    const el = document.querySelector(".editor__spotlight") as HTMLElement | null;
    startWRef.current = px || (el ? Math.round(el.getBoundingClientRect().width) : 420);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = clamp(startWRef.current + (e.clientX - startXRef.current), 240, window.innerWidth * 0.7);
    document.documentElement.style.setProperty("--spotlight-w", `${Math.round(next)}px`);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const cur = getComputedStyle(document.documentElement).getPropertyValue("--spotlight-w").trim();
    const px = parseInt(cur.endsWith("px") ? cur : "0", 10);
    if (px > 0) { try { localStorage.setItem(STORAGE_KEY, String(px)); } catch { /* ignore */ } }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };
  return (
    <div className="editor__vsplitter editor__spotlight-splitter"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      title="Drag to resize the enlarged panel" />
  );
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
  const [coneTarget, setConeTarget] = useState<number | null>(null);
  const [coneDir, setConeDir] = useState<ConeDir>("backward");
  // Clear the cone selection on tab switch.
  useEffect(() => { setConeTarget(null); }, [t.activeId]);
  const coneIds = useMemo(
    () => (coneTarget === null || coneTarget >= circuit.numQubits
      ? null
      : computeLightCone(circuit, coneTarget, coneDir)),
    [circuit, coneTarget, coneDir],
  );
  const [gateClipboardVersion, setGateClipboardVersion] = useState(0);
  const hasGateClipboard = useMemo(() => {
    void gateClipboardVersion;
    try { return !!localStorage.getItem(GATE_CLIPBOARD_KEY); } catch { return false; }
  }, [gateClipboardVersion]);
  // Reset rubber-band selection when switching tabs — it's a per-tab UI
  // state, like selectedGateId, and stale ids would refer to gates that
  // belong to a different circuit.
  useEffect(() => { setSelectedIds(new Set()); }, [t.activeId]);
  // Canvas view state (per-tab): zoom factor and UI-only folded ranges.
  const [zoom, setZoom] = useState(1);
  const [folds, setFolds] = useState<Array<{ from: number; to: number }>>([]);
  useEffect(() => { setFolds([]); setZoom(1); }, [t.activeId]);

  // Whole-palette collapse (gives the canvas more room). Persisted.
  const [paletteCollapsed, setPaletteCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("quantiom:palette-collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("quantiom:palette-collapsed", paletteCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [paletteCollapsed]);

  // Whole right-panel-column collapse (mirrors the palette). Persisted.
  const [panelsCollapsed, setPanelsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("quantiom:panels-collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("quantiom:panels-collapsed", panelsCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [panelsCollapsed]);
  // When a panel is revealed (e.g. by the AI agent's set_panel tool), expand the
  // whole panel column if it's collapsed — otherwise the panel stays hidden.
  useEffect(() => {
    const onReveal = () => setPanelsCollapsed(false);
    window.addEventListener(PANEL_COLUMN_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(PANEL_COLUMN_REVEAL_EVENT, onReveal);
  }, []);

  // Inspector side-panel collapse (right of the canvas). Persisted.
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("quantiom:inspector-collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("quantiom:inspector-collapsed", inspectorCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [inspectorCollapsed]);

  // "Spotlight": an analysis panel enlarged in a dock on the left of the
  // circuit (drag a panel header onto the canvas, or click its ⤢ grip).
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [spotlightEl, setSpotlightEl] = useState<HTMLElement | null>(null);
  const [spotlightDragOver, setSpotlightDragOver] = useState(false);
  const onSpotlightDragOver = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes(SPOTLIGHT_DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setSpotlightDragOver(true);
  }, []);
  const onSpotlightDrop = useCallback((e: React.DragEvent) => {
    const id = e.dataTransfer.getData(SPOTLIGHT_DND_MIME);
    setSpotlightDragOver(false);
    if (id) { e.preventDefault(); setSpotlightId(id); }
  }, []);

  // Shared gate-clipboard ops (used by both the Edit menu and keyboard).
  const copySelection = useCallback(() => {
    const selected = circuit.gates.filter((g) => selectedIds.has(g.id));
    if (selected.length === 0) return;
    const minCol = Math.min(...selected.map((g) => g.column));
    const slice = selected.map((g) => ({
      gateId: g.gateId, controls: g.controls, targets: g.targets, clbits: g.clbits,
      params: g.params, column: g.column - minCol, controlStates: g.controlStates,
      condition: g.condition, annotation: g.annotation,
    }));
    try { localStorage.setItem(GATE_CLIPBOARD_KEY, JSON.stringify(slice)); setGateClipboardVersion((v) => v + 1); } catch { /* quota */ }
  }, [circuit.gates, selectedIds]);
  const cutSelection = useCallback(() => {
    const selected = circuit.gates.filter((g) => selectedIds.has(g.id));
    if (selected.length === 0) return;
    copySelection();
    for (const g of selected) dispatch({ type: "remove-gate", id: g.id });
    setSelectedIds(new Set());
  }, [circuit.gates, selectedIds, copySelection, dispatch]);
  const pasteSelection = useCallback(() => {
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
      dispatch({ type: "place-gate", gate: { ...s, id: `paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, column: atColumn + s.column } });
    }
  }, [circuit, dispatch]);
  const [customGates, setCustomGates] = useState<CustomGate[]>(() => loadCustomGates());
  const [noise, setNoise] = useState<NoiseModel>(() => loadNoise());
  const [findQuery, setFindQuery] = useState<string>("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDocs, setShowDocs] = useState<null | string>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showSelfTest, setShowSelfTest] = useState(false);

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
  // Gates the simulator skipped (unimplemented, entangled state-prep, bad
  // condition) → canvas red ring + reason tooltip.
  const skippedMap = useMemo(() => {
    const m = new Map<string, string>();
    const d = dataOf(simState);
    if (d?.skipped) for (const s of d.skipped) m.set(s.id, s.reason);
    return m;
  }, [simState]);
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
      // Gate-clipboard shortcuts (act on the rubber-band selection).
      if (mod && e.key.toLowerCase() === "c" && !inField && selectedIds.size > 0) {
        e.preventDefault(); copySelection(); return;
      }
      if (mod && e.key.toLowerCase() === "x" && !inField && selectedIds.size > 0) {
        e.preventDefault(); cutSelection(); return;
      }
      if (mod && e.key.toLowerCase() === "v" && !inField) {
        e.preventDefault(); pasteSelection(); return;
      }
      // Arrow keys nudge the selected gate one column / qubit.
      if (!mod && !inField && selectedGateId && e.key.startsWith("Arrow")) {
        const g = circuit.gates.find((x) => x.id === selectedGateId);
        if (g) {
          const all = [...g.controls, ...g.targets];
          const lo = all.length ? Math.min(...all) : 0;
          if (e.key === "ArrowLeft") { e.preventDefault(); dispatch({ type: "move-gate", id: g.id, column: Math.max(0, g.column - 1), anchorQubit: lo }); return; }
          if (e.key === "ArrowRight") { e.preventDefault(); dispatch({ type: "move-gate", id: g.id, column: g.column + 1, anchorQubit: lo }); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); dispatch({ type: "move-gate", id: g.id, column: g.column, anchorQubit: Math.max(0, lo - 1) }); return; }
          if (e.key === "ArrowDown") { e.preventDefault(); dispatch({ type: "move-gate", id: g.id, column: g.column, anchorQubit: lo + 1 }); return; }
        }
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
  }, [dispatch, selectedGateId, setSelectedGateId, t, selectedIds, circuit.gates, copySelection, cutSelection, pasteSelection]);

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
    <SpotlightProvider value={{ id: spotlightId, container: spotlightEl, setId: setSpotlightId }}>
    <div className={`editor${paletteCollapsed ? " editor--palette-collapsed" : ""}${panelsCollapsed ? " editor--panels-collapsed" : ""}`}>
      <HoverTip />
      {showDocs !== null && <DocsModal initialTab={showDocs} onClose={() => setShowDocs(null)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showSelfTest && <SelfTestModal onClose={() => setShowSelfTest(false)} />}
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
          <img src="/quantiom-logo.png" className="app__logo" alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <h1>Quantiom</h1>
          <span className="app__version">v{APP_VERSION}.{__GIT_COMMITS__} ({__GIT_SHA__})</span>
          <EndiannessToggle />
        </div>
        <div className="app__title">{circuit.name ?? "Untitled"}</div>
        <div className="app__header-right" />
      </header>
      <GatePalette
        customGates={customGates}
        onRemoveCustomGate={removeCustomGate}
        collapsed={paletteCollapsed}
        onToggleCollapsed={() => setPaletteCollapsed((v) => !v)}
      />
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
            <FileMenu circuit={circuit} dispatch={dispatch} paramValues={paramValues} onLoadInNewTab={(c, name) => t.newTab(c, name)} onCloseAll={t.closeAllTabs} />
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
              onCopySelection={copySelection}
              onCutSelection={cutSelection}
              onPasteSelection={pasteSelection}
              onRepeatSelection={() => {
                const cols = circuit.gates.filter((g) => selectedIds.has(g.id)).map((g) => g.column);
                if (cols.length === 0) return;
                const ans = window.prompt("Repeat the selected columns how many times?", "3");
                if (ans === null) return;
                const times = parseInt(ans, 10);
                if (!Number.isFinite(times) || times < 1) return;
                dispatch({ type: "repeat-range", fromColumn: Math.min(...cols), toColumn: Math.max(...cols), times });
              }}
              onFoldSelection={() => {
                const cols = circuit.gates.filter((g) => selectedIds.has(g.id)).map((g) => g.column);
                if (cols.length === 0) return;
                const from = Math.min(...cols), to = Math.max(...cols);
                setFolds((prev) => [...prev.filter((f) => !(f.from === from && f.to === to)), { from, to }]);
                setSelectedIds(new Set());
              }}
              onInsertSnippet={(snip) => {
                const block = snip.build(circuit.numQubits);
                if (block.length === 0) return;
                dispatch({ type: "insert-gates", gates: block });
              }}
              snippets={SNIPPETS}
              snippetMinOK={(min) => circuit.numQubits >= min}
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
            <button onClick={() => setShowAbout(true)} title="About Quantiom">
              About
            </button>
            <button onClick={() => setShowSelfTest(true)} title="Validate the engine live in your browser">
              Self-test
            </button>
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
        <div className="editor__transport">
          <StepBar maxColumn={maxColumn} step={effectiveStep} onChange={setPickedStep} />
          <div className="editor__zoombar">
            <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Zoom out" disabled={zoom <= 0.4}>−</button>
            <span className="editor__zoom-pct">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} title="Zoom in" disabled={zoom >= 2}>+</button>
            <button onClick={() => setZoom(1)} title="Reset zoom to 100%">Reset</button>
            {folds.length > 0 && (
              <button onClick={() => setFolds([])} title="Expand all folded ranges">Unfold all ({folds.length})</button>
            )}
          </div>
        </div>
        <div
          className={`editor__canvas-row${spotlightDragOver ? " editor__canvas-row--drop" : ""}`}
          onDragOver={onSpotlightDragOver}
          onDrop={onSpotlightDrop}
          onDragLeave={() => setSpotlightDragOver(false)}
        >
          {spotlightId && (
            <>
              <aside className="editor__spotlight">
                <div className="editor__spotlight-mount" ref={setSpotlightEl} />
              </aside>
              <SpotlightSplitter />
            </>
          )}
          <div className="editor__canvas-scroll">
            <div className="editor__canvas-zoom" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
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
                coneIds={coneIds}
                skipped={skippedMap}
                folds={folds}
                onUnfold={(f) => setFolds((prev) => prev.filter((x) => !(x.from === f.from && x.to === f.to)))}
              />
            </div>
          </div>
          {inspectorCollapsed ? (
            <button
              className="inspector-reopen"
              onClick={() => setInspectorCollapsed(false)}
              title="Show inspector"
              aria-label="Show inspector"
            >
              <span className="palette__reopen-icon">◂</span>
              <span className="palette__reopen-label">INSPECTOR</span>
            </button>
          ) : (
            <>
              <InspectorSplitter />
              <Inspector
                circuit={circuit}
                dispatch={dispatch}
                selectedGateId={selectedGateId}
                onCollapse={() => setInspectorCollapsed(true)}
              />
            </>
          )}
        </div>
        <ErrorBoundary label="chat">
          <ChatPanel
            circuit={circuit}
            simResult={dataOf(simState)}
            noise={noise}
            customGates={customGates}
            paramValues={paramValues}
            onLoadInNewTab={(c, n) => t.newTab(c, n)}
            onApplyCircuit={(c) => dispatch({ type: "replace-circuit", circuit: c })}
            onSetNoise={setNoise}
            onListTabs={() => t.tabs.map((x, i) => ({ index: i, name: x.versioned.present.name ?? "Untitled", numQubits: x.versioned.present.numQubits, active: x.id === t.activeId }))}
            onSwitchTab={(i) => { const tab = t.tabs[i]; if (!tab) return false; t.switchTab(tab.id); return true; }}
            onCloseTab={(i) => { const tab = t.tabs[i]; if (!tab) return false; t.closeTab(tab.id); return true; }}
            onSaveCustomGate={(c, name) => setCustomGates((prev) => [...prev, { id: newCustomGateId(), name: name.trim(), numQubits: c.numQubits, gates: c.gates.map((g) => ({ ...g })) }])}
            onSetParams={(vals) => setParamValues({ ...paramValues, ...vals })}
          />
        </ErrorBoundary>
      </div>
      <div className="editor__right">
        <button
          className="panels__reopen"
          onClick={() => setPanelsCollapsed(false)}
          title="Show panels"
          aria-label="Show panels"
        >
          <span className="palette__reopen-icon">◂</span>
          <span className="palette__reopen-label">PANELS</span>
        </button>
        <div className="editor__right-bar">
          <button
            className="palette__collapse"
            onClick={() => setPanelsCollapsed(true)}
            title="Collapse panels"
            aria-label="Collapse panels"
          >▸</button>
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
          <span className="editor__right-bar-end">
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
            <button className="editor__panels-btn" onClick={() => setAllPanelsCollapsed(false)} title="Expand all panels">all</button>
            <button className="editor__panels-btn" onClick={() => setAllPanelsCollapsed(true)} title="Collapse all panels">none</button>
          </span>
        </div>
        <div className="panels-cat">Controls</div>
        <ErrorBoundary label="parameters">
          <ParameterPanel state={simState} values={paramValues} onChange={setParamValues} />
        </ErrorBoundary>
        <ErrorBoundary label="custom-plots">
          <CustomPlotPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>

        <div className="panels-cat">State</div>
        <ErrorBoundary label="statevector"><StatevectorPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="amp-phase"><AmplitudePhasePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="probabilities">
          <ProbabilityPanel
            state={simState}
            gpuProbabilities={gpuProbs}
            sampledProbabilities={sampledProbs}
            sampledShots={hasMeasurements ? SAMPLED_SHOTS : undefined}
            shotsTick={shotsTick}
          />
        </ErrorBoundary>
        <ErrorBoundary label="phase-disk"><PhaseDiskPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="bloch"><BlochPanel state={simState} gpuBlochVectors={gpuBloch} /></ErrorBoundary>
        <ErrorBoundary label="bloch-trajectory">
          <BlochTrajectoryPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="qsphere"><QSpherePanel state={simState} /></ErrorBoundary>

        <div className="panels-cat">Measurement</div>
        <ErrorBoundary label="measurement-counts">
          <MeasurementCountsPanel circuit={circuit} customGates={customGates} paramValues={paramValues} shotsTick={shotsTick} />
        </ErrorBoundary>
        <ErrorBoundary label="branch-tree">
          <BranchTreePanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>

        <div className="panels-cat">Phase space &amp; magic</div>
        <ErrorBoundary label="wigner"><WignerPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="husimi"><HusimiPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="magic"><MagicPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="characteristic-function"><CharacteristicFunctionPanel state={simState} /></ErrorBoundary>

        <div className="panels-cat">Expectation &amp; metrology</div>
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
        <ErrorBoundary label="qfi"><QfiPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="spin-squeezing"><SpinSqueezingPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="observable-variance"><ObservableVariancePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="qgt">
          <QgtPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>

        <div className="panels-cat">Entanglement &amp; correlations</div>
        <ErrorBoundary label="mutual-info"><MutualInfoPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="negativity"><NegativityPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="concurrence"><ConcurrencePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="schmidt"><SchmidtPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="entanglement-hamiltonian"><EntanglementHamiltonianPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="entropy-profile"><EntropyProfilePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="page-curve"><PageCurvePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="tripartite-info"><TripartiteInfoPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="counting-statistics"><CountingStatisticsPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="participation">
          <ParticipationPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="correlations"><CorrelationPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="structure-factor"><StructureFactorPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="symmetry-sectors"><SymmetrySectorsPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="coherence">
          <CoherencePanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>
        <ErrorBoundary label="entanglement-asymmetry">
          <AsymmetryPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>

        <div className="panels-cat">Dynamics</div>
        <ErrorBoundary label="space-time">
          <SpaceTimePanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="space-time-entropy">
          <SpaceTimeEntropyPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="t-sweep">
          <TSweepPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="t-sweep-fft">
          <TSweepFFTPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="loschmidt">
          <LoschmidtPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="otoc">
          <OtocPanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="butterfly-velocity">
          <ButterflyVelocityPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="imbalance">
          <ImbalancePanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="krylov"><KrylovPanel state={simState} /></ErrorBoundary>

        <div className="panels-cat">Operator &amp; spectrum</div>
        <ErrorBoundary label="density"><DensityPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="unitary-heatmap">
          <UnitaryHeatmapPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="ptm">
          <PTMPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="operator-entanglement">
          <OperatorEntanglementPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="zx"><ZXPanel circuit={circuit} /></ErrorBoundary>
        <ErrorBoundary label="hamiltonian">
          <HamiltonianPanel onLoadInNewTab={(c, n) => t.newTab(c, n)} />
        </ErrorBoundary>
        <ErrorBoundary label="state-prep">
          <StatePrepPanel onLoadInNewTab={(c, n) => t.newTab(c, n)} />
        </ErrorBoundary>
        <ErrorBoundary label="unitary-synth">
          <UnitarySynthPanel circuit={circuit} customGates={customGates} paramValues={paramValues} onLoadInNewTab={(c, n) => t.newTab(c, n)} />
        </ErrorBoundary>
        <ErrorBoundary label="ham-spectrum"><HamSpectrumPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="density-of-states"><DensityOfStatesPanel /></ErrorBoundary>
        <ErrorBoundary label="berry-phase">
          <BerryPhasePanel state={simState} circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="diagonal-ensemble"><DiagonalEnsemblePanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="spectral-form-factor"><SpectralFormFactorPanel /></ErrorBoundary>
        <ErrorBoundary label="level-statistics"><LevelStatisticsPanel /></ErrorBoundary>

        <div className="panels-cat">Circuit structure</div>
        <ErrorBoundary label="interaction-graph"><InteractionGraphPanel circuit={circuit} /></ErrorBoundary>
        <ErrorBoundary label="tanner"><TannerPanel circuit={circuit} /></ErrorBoundary>
        <ErrorBoundary label="stabilizer-tableau"><StabilizerTableauPanel circuit={circuit} customGates={customGates} /></ErrorBoundary>
        <ErrorBoundary label="light-cone">
          <LightConePanel numQubits={circuit.numQubits} target={coneTarget} dir={coneDir} onTarget={setConeTarget} onDir={setConeDir} />
        </ErrorBoundary>
        <ErrorBoundary label="resources"><ResourcePanel circuit={circuit} coupling={noise.coupling} /></ErrorBoundary>

        <div className="panels-cat">Noise &amp; error</div>
        <ErrorBoundary label="noise"><NoisePanel noise={noise} onChange={setNoise} /></ErrorBoundary>
        <ErrorBoundary label="decoherence">
          <DecoherencePanel circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>
        <ErrorBoundary label="fidelity">
          <FidelityPanel circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>
        <ErrorBoundary label="readout-mitigation">
          <ReadoutMitigationPanel circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>

        <div className="panels-cat">Characterization &amp; benchmarking</div>
        <ErrorBoundary label="syndromes">
          <SyndromePanel circuit={circuit} customGates={customGates} noise={noise} shotsTick={shotsTick} />
        </ErrorBoundary>
        <ErrorBoundary label="randomized-benchmarking"><RbPanel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="quantum-volume"><QvPanel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="mirror-benchmark"><MirrorPanel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="xeb"><XebPanel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="simultaneous-rb"><CrosstalkPanel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="t1-t2"><T1T2Panel noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="pauli-budget"><PauliBudgetPanel circuit={circuit} noise={noise} /></ErrorBoundary>
        <ErrorBoundary label="qec-workbench"><QecPanel /></ErrorBoundary>
        <ErrorBoundary label="classical-shadows">
          <ClassicalShadowsPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="tomography">
          <TomographyPanel circuit={circuit} customGates={customGates} paramValues={paramValues} noise={noise} />
        </ErrorBoundary>

        <div className="panels-cat">Verification &amp; export</div>
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
        <ErrorBoundary label="qasm"><QasmPanel circuit={circuit} dispatch={dispatch} /></ErrorBoundary>
      </div>
    </div>
    </SpotlightProvider>
  );
}

