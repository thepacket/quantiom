import type { Circuit, PlacedGate } from "./types";
import type { HistoryAction } from "./state";
import { GATES_BY_ID, totalQubits } from "./gates";

type Props = {
  circuit: Circuit;
  selectedGateId: string | null;
  dispatch: React.Dispatch<HistoryAction>;
  onSelect: (id: string | null) => void;
};

export function Inspector({ circuit, selectedGateId, dispatch, onSelect }: Props) {
  const gate = circuit.gates.find((g) => g.id === selectedGateId) ?? null;

  if (!gate) {
    return (
      <div className="inspector inspector--empty">
        <p>Drag a gate from the palette onto a qubit wire. Click a placed gate to edit.</p>
      </div>
    );
  }

  const def = GATES_BY_ID[gate.gateId];

  const updateParam = (i: number, value: string) => {
    const params = [...gate.params];
    params[i] = value;
    dispatch({ type: "update-gate", id: gate.id, patch: { params } });
  };

  const updateQubit = (kind: "controls" | "targets", idx: number, value: number) => {
    const arr = [...gate[kind]];
    arr[idx] = value;
    dispatch({ type: "update-gate", id: gate.id, patch: { [kind]: arr } as Partial<PlacedGate> });
  };

  const updateClbit = (idx: number, value: number) => {
    const arr = [...gate.clbits];
    arr[idx] = value;
    dispatch({ type: "update-gate", id: gate.id, patch: { clbits: arr } });
  };

  const updateColumn = (value: number) => {
    dispatch({ type: "update-gate", id: gate.id, patch: { column: Math.max(0, value) } });
  };

  const qubitOptions = Array.from({ length: circuit.numQubits }, (_, i) => i);
  const clbitOptions = Array.from({ length: circuit.numClbits }, (_, i) => i);

  return (
    <div className="inspector">
      <div className="inspector__head">
        <div>
          <div className="inspector__name">{def.name}</div>
          <div className="inspector__sub">
            id: {def.id} · {totalQubits(def)} qubit{totalQubits(def) === 1 ? "" : "s"}
            {def.numClbits ? ` · ${def.numClbits} clbit` : ""}
          </div>
        </div>
        <button
          className="inspector__delete"
          onClick={() => {
            dispatch({ type: "remove-gate", id: gate.id });
            onSelect(null);
          }}
        >
          Delete
        </button>
      </div>

      <div className="inspector__row">
        <label>Column</label>
        <input
          type="number"
          min={0}
          value={gate.column}
          onChange={(e) => updateColumn(parseInt(e.target.value || "0", 10))}
        />
      </div>

      {gate.controls.length > 0 && (
        <fieldset className="inspector__group">
          <legend>Controls</legend>
          {gate.controls.map((q, i) => (
            <div key={`c-${i}`} className="inspector__row">
              <label>control {i}</label>
              <select value={q} onChange={(e) => updateQubit("controls", i, parseInt(e.target.value, 10))}>
                {qubitOptions.map((qi) => (
                  <option key={qi} value={qi}>
                    q{qi}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
      )}

      {gate.targets.length > 0 && (
        <fieldset className="inspector__group">
          <legend>Targets</legend>
          {gate.targets.map((q, i) => (
            <div key={`t-${i}`} className="inspector__row">
              <label>target {i}</label>
              <select value={q} onChange={(e) => updateQubit("targets", i, parseInt(e.target.value, 10))}>
                {qubitOptions.map((qi) => (
                  <option key={qi} value={qi}>
                    q{qi}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
      )}

      {def.numClbits > 0 && clbitOptions.length > 0 && (
        <fieldset className="inspector__group">
          <legend>Classical bits</legend>
          {gate.clbits.map((c, i) => (
            <div key={`cl-${i}`} className="inspector__row">
              <label>clbit {i}</label>
              <select value={c} onChange={(e) => updateClbit(i, parseInt(e.target.value, 10))}>
                {clbitOptions.map((ci) => (
                  <option key={ci} value={ci}>
                    c{ci}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
      )}

      {def.params.length > 0 && (
        <fieldset className="inspector__group">
          <legend>Parameters (symbolic)</legend>
          {def.params.map((p, i) => (
            <div key={`p-${i}`} className="inspector__row">
              <label>{p.name}</label>
              <input value={gate.params[i] ?? ""} onChange={(e) => updateParam(i, e.target.value)} />
            </div>
          ))}
        </fieldset>
      )}

      {def.description && <p className="inspector__desc">{def.description}</p>}
    </div>
  );
}
