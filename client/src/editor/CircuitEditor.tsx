import { useEffect, useState } from "react";
import { useCircuit } from "./state";
import { CircuitCanvas } from "./CircuitCanvas";
import { GatePalette } from "./GatePalette";
import { Inspector } from "./Inspector";

export function CircuitEditor() {
  const [circuit, dispatch] = useCircuit();
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedGateId) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
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
    </div>
  );
}
