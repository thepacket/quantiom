import { useEffect, useMemo, useState } from "react";
import { version as APP_VERSION } from "../../package.json";
import { useTabs } from "./tabs";
import { TabStrip } from "./TabStrip";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { StepBar } from "./StepBar";
import { loadCustomGates, newCustomGateId, saveCustomGates, type CustomGate } from "./customGates";
import { decodeCircuitFromHash } from "./shareLink";
import { inverseGates } from "./inverse";
import { transpile, type TranspileTarget } from "../sim/transpile";
import { routeCircuit } from "../sim/router";
import { StatevectorPanel } from "../panels/StatevectorPanel";
import { QasmPanel } from "../panels/QasmPanel";
import { ProbabilityPanel } from "../panels/ProbabilityPanel";
import { BlochPanel } from "../panels/BlochPanel";
import { ExpectationPanel } from "../panels/ExpectationPanel";
import { DensityPanel } from "../panels/DensityPanel";
import { NoisePanel } from "../panels/NoisePanel";
import { PhaseDiskPanel } from "../panels/PhaseDiskPanel";
import { ResourcePanel } from "../panels/ResourcePanel";
import { EquivalencePanel } from "../panels/EquivalencePanel";
import { SyndromePanel } from "../panels/SyndromePanel";
import { MeasurementCountsPanel } from "../panels/MeasurementCountsPanel";
import { TomographyPanel } from "../panels/TomographyPanel";
import { HamiltonianPanel } from "../panels/HamiltonianPanel";
import { ParameterPanel } from "../panels/ParameterPanel";
import { ErrorBoundary } from "../panels/ErrorBoundary";
import { useStatevector } from "../panels/useSimulation";
import { loadNoise, saveNoise, type NoiseModel } from "../sim/noise";

function TranspileButton({ onTranspile }: { onTranspile: (t: TranspileTarget) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Rewrite into a target native gate set">Transpile…</button>
      {open && (
        <div
          className="examples-picker__pop"
          style={{ width: 200, top: "100%", marginTop: 4 }}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="examples-picker__list">
            {[
              { id: "clifford-t" as const, label: "Clifford + T", hint: "{H, S, T, CX}" },
              { id: "ibm-heavy-hex" as const, label: "IBM heavy-hex", hint: "{RZ, SX, CX}" },
              { id: "rigetti" as const, label: "Rigetti", hint: "{RZ, RX(±π/2), CZ}" },
            ].map((t) => (
              <button
                key={t.id}
                className="examples-picker__item"
                onClick={() => { setOpen(false); onTranspile(t.id); }}
              >
                <span>{t.label}</span>
                <span className="export-picker__hint">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
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

  const [customGates, setCustomGates] = useState<CustomGate[]>(() => loadCustomGates());
  const [noise, setNoise] = useState<NoiseModel>(() => loadNoise());

  useEffect(() => {
    saveCustomGates(customGates);
  }, [customGates]);

  useEffect(() => {
    saveNoise(noise);
  }, [noise]);

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
            <button onClick={onSaveAsGate} title="Save the current circuit as a reusable custom gate">Save as gate</button>
            <button
              onClick={() => {
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
              title="Append the inverse (U†) of the current circuit"
            >
              Append U†
            </button>
            {noise.coupling && (
              <button
                onClick={() => {
                  const result = routeCircuit(circuit, noise.coupling!);
                  t.newTab(result.circuit, result.circuit.name);
                  window.alert(
                    `Routed to coupling map:\n` +
                    `  violations:    ${result.violationsBefore}\n` +
                    `  SWAPs added:   ${result.swapsInserted}\n` +
                    `  total gates:   ${circuit.gates.length} → ${result.circuit.gates.length}`,
                  );
                }}
                title="Insert SWAPs to satisfy the imported coupling map"
              >
                Route
              </button>
            )}
            <TranspileButton
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
            />
            <button
              onClick={() => dispatch({ type: "compact-columns" })}
              title="Auto-arrange columns: pull every gate as far left as it can go without collision"
            >
              Compact
            </button>
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
          />
        </div>
        <Inspector
          circuit={circuit}
          dispatch={dispatch}
          selectedGateId={selectedGateId}
          onSelect={setSelectedGateId}
          onStepTo={setPickedStep}
        />
      </div>
      <div className="editor__right">
        <ErrorBoundary label="parameters">
          <ParameterPanel state={simState} values={paramValues} onChange={setParamValues} />
        </ErrorBoundary>
        <ErrorBoundary label="statevector"><StatevectorPanel state={simState} /></ErrorBoundary>
        <ErrorBoundary label="probabilities"><ProbabilityPanel state={simState} /></ErrorBoundary>
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
        <ErrorBoundary label="equivalence">
          <EquivalencePanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="syndromes">
          <SyndromePanel circuit={circuit} customGates={customGates} />
        </ErrorBoundary>
        <ErrorBoundary label="measurement-counts">
          <MeasurementCountsPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="tomography">
          <TomographyPanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="hamiltonian">
          <HamiltonianPanel onLoadInNewTab={(c, n) => t.newTab(c, n)} />
        </ErrorBoundary>
        <ErrorBoundary label="qasm"><QasmPanel circuit={circuit} dispatch={dispatch} /></ErrorBoundary>
      </div>
    </div>
  );
}

