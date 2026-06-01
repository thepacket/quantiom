import { useEffect, useState } from "react";
import { useCircuit } from "./state";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";
import { FileMenu } from "./FileMenu";
import { StatevectorPanel } from "../panels/StatevectorPanel";
import { QasmPanel } from "../panels/QasmPanel";
import { ProbabilityPanel } from "../panels/ProbabilityPanel";
import { BlochPanel } from "../panels/BlochPanel";
import { FormalMathPanel } from "../panels/FormalMathPanel";
import { ParameterPanel } from "../panels/ParameterPanel";
import { ErrorBoundary } from "../panels/ErrorBoundary";
import { useStatevector } from "../panels/useSimulation";
import type { ParameterValues } from "../api";

export function CircuitEditor() {
  const [circuit, dispatch, history] = useCircuit();
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<ParameterValues>({});
  const simState = useStatevector(circuit, paramValues);

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
      <GatePalette />
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
            <button onClick={() => dispatch({ type: "clear" })} title="Clear circuit">Clear</button>
          </div>
        </div>
        <div className="editor__canvas-scroll">
          <CircuitCanvas
            circuit={circuit}
            dispatch={dispatch}
            selectedGateId={selectedGateId}
            onSelect={setSelectedGateId}
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
        <ErrorBoundary label="formal-math"><FormalMathPanel circuit={circuit} /></ErrorBoundary>
        <ErrorBoundary label="qasm"><QasmPanel circuit={circuit} dispatch={dispatch} /></ErrorBoundary>
      </div>
    </div>
  );
}
