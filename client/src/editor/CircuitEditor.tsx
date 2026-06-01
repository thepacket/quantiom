import { useEffect, useMemo, useState } from "react";
import { version as APP_VERSION } from "../../package.json";
import { useCircuit } from "./state";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { StepBar } from "./StepBar";
import { loadCustomGates, newCustomGateId, saveCustomGates, type CustomGate } from "./customGates";
import { decodeCircuitFromHash } from "./shareLink";
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
import { ParameterPanel } from "../panels/ParameterPanel";
import { ErrorBoundary } from "../panels/ErrorBoundary";
import { useStatevector } from "../panels/useSimulation";
import { loadNoise, saveNoise, type NoiseModel } from "../sim/noise";
import type { ParameterValues } from "../api";

export function CircuitEditor() {
  const [circuit, dispatch, history] = useCircuit();
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<ParameterValues>({});
  const [customGates, setCustomGates] = useState<CustomGate[]>(() => loadCustomGates());
  const [noise, setNoise] = useState<NoiseModel>(() => loadNoise());

  useEffect(() => {
    saveCustomGates(customGates);
  }, [customGates]);

  useEffect(() => {
    saveNoise(noise);
  }, [noise]);

  // Auto-load circuit from URL hash (#c=<gzip+base64url>) once on mount.
  // Wins over localStorage so shared links open the intended circuit even
  // when the user already has a saved working circuit.
  useEffect(() => {
    let cancelled = false;
    decodeCircuitFromHash(location.hash).then((c) => {
      if (cancelled || !c) return;
      dispatch({ type: "replace-circuit", circuit: c });
    });
    return () => { cancelled = true; };
  }, [dispatch]);

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
  const [pickedStep, setPickedStep] = useState<number | null>(null);
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

      if ((e.key === "Delete" || e.key === "Backspace") && selectedGateId && !inField) {
        dispatch({ type: "remove-gate", id: selectedGateId });
        setSelectedGateId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, selectedGateId]);

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
            <FileMenu circuit={circuit} dispatch={dispatch} />
            <span className="editor__sep">·</span>
            <button
              onClick={() => dispatch({ type: "undo" })}
              disabled={!history.canUndo}
              title="Undo (⌘Z / Ctrl+Z)"
            >
              Undo
            </button>
            <button
              onClick={() => dispatch({ type: "redo" })}
              disabled={!history.canRedo}
              title="Redo (⇧⌘Z / Ctrl+Shift+Z)"
            >
              Redo
            </button>
            <button onClick={onSaveAsGate} title="Save the current circuit as a reusable custom gate">Save as gate</button>
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
        <ErrorBoundary label="resources"><ResourcePanel circuit={circuit} /></ErrorBoundary>
        <ErrorBoundary label="equivalence">
          <EquivalencePanel circuit={circuit} customGates={customGates} paramValues={paramValues} />
        </ErrorBoundary>
        <ErrorBoundary label="syndromes">
          <SyndromePanel circuit={circuit} customGates={customGates} />
        </ErrorBoundary>
        <ErrorBoundary label="qasm"><QasmPanel circuit={circuit} dispatch={dispatch} /></ErrorBoundary>
      </div>
    </div>
  );
}
