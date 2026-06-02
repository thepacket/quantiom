import type { Circuit, PlacedGate } from "./types";
import type { HistoryAction } from "./state";
import { GATES_BY_ID, totalQubits } from "./gates";

function ArbitraryMatrix({
  dim,
  params,
  onChange,
}: {
  dim: number;
  params: string[];
  onChange: (idx: number, value: string) => void;
}) {
  // Params order: row-major, two slots per cell (Re then Im).
  const rows = Array.from({ length: dim }, (_, i) => i);
  return (
    <div className="arb-matrix">
      <div className="arb-matrix__hint">
        {dim}×{dim} matrix. Re + Im·i in each cell. Expressions ok.
      </div>
      <table className="arb-matrix__grid">
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              {rows.map((col) => {
                const baseIdx = (row * dim + col) * 2;
                return (
                  <td key={col}>
                    <input
                      className="arb-matrix__cell"
                      value={params[baseIdx] ?? ""}
                      onChange={(e) => onChange(baseIdx, e.target.value)}
                      title={`Re M${row}${col}`}
                    />
                    <input
                      className="arb-matrix__cell arb-matrix__cell--im"
                      value={params[baseIdx + 1] ?? ""}
                      onChange={(e) => onChange(baseIdx + 1, e.target.value)}
                      title={`Im M${row}${col}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Props = {
  circuit: Circuit;
  selectedGateId: string | null;
  dispatch: React.Dispatch<HistoryAction>;
  onSelect: (id: string | null) => void;
  /** Optional — when provided, the Inspector renders a "Step to before"
   *  button that freezes the simulator just before this gate so all the
   *  panels reflect the state the gate is about to act on. */
  onStepTo?: (column: number | null) => void;
};

export function Inspector({ circuit, selectedGateId, dispatch, onSelect, onStepTo }: Props) {
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
        <div className="inspector__head-actions">
          {onStepTo && (
            <button
              className="inspector__step-here"
              onClick={() => onStepTo(gate.column - 1)}
              title="Freeze the simulator just before this gate so the panels show what it acts on"
            >
              Step here
            </button>
          )}
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
          {gate.controls.map((q, i) => {
            const onState = gate.controlStates ? gate.controlStates[i] !== false : true;
            const toggle = () => {
              const next = gate.controls.map((_, j) =>
                gate.controlStates ? gate.controlStates[j] !== false : true,
              );
              next[i] = !onState;
              dispatch({ type: "update-gate", id: gate.id, patch: { controlStates: next } });
            };
            return (
              <div key={`c-${i}`} className="inspector__row">
                <label>control {i}</label>
                <div className="inspector__ctrl">
                  <select
                    value={q}
                    onChange={(e) => updateQubit("controls", i, parseInt(e.target.value, 10))}
                  >
                    {qubitOptions.map((qi) => (
                      <option key={qi} value={qi}>q{qi}</option>
                    ))}
                  </select>
                  <button
                    className={"inspector__anti" + (onState ? " inspector__anti--on" : " inspector__anti--off")}
                    onClick={toggle}
                    title={onState ? "Fires on |1⟩ (normal control). Click for anti-control." : "Fires on |0⟩ (anti-control). Click for normal."}
                  >
                    {onState ? "●" : "○"}
                  </button>
                </div>
              </div>
            );
          })}
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
          <legend>Parameters</legend>
          {gate.gateId === "u_arb" ? (
            <ArbitraryMatrix dim={2} params={gate.params} onChange={updateParam} />
          ) : gate.gateId === "u_arb_2" ? (
            <ArbitraryMatrix dim={4} params={gate.params} onChange={updateParam} />
          ) : (
            def.params.map((p, i) => (
              <div key={`p-${i}`} className="inspector__row">
                <label>{p.name}</label>
                <input value={gate.params[i] ?? ""} onChange={(e) => updateParam(i, e.target.value)} />
              </div>
            ))
          )}
        </fieldset>
      )}

      {/* Classical condition — gate executes only if c[k] == v. Not
          shown for measurements (those produce the bits) or markers. */}
      {circuit.numClbits > 0
        && gate.gateId !== "measure" && gate.gateId !== "measure_x" && gate.gateId !== "measure_y"
        && gate.gateId !== "reset" && gate.gateId !== "barrier" && gate.gateId !== "delay" && (
        <fieldset className="inspector__group">
          <legend>Classical condition</legend>
          <div className="inspector__row">
            <label>
              <input
                type="checkbox"
                checked={!!gate.condition}
                onChange={(e) => {
                  const next = e.target.checked
                    ? { clbit: gate.condition?.clbit ?? 0, value: gate.condition?.value ?? 1 }
                    : undefined;
                  dispatch({ type: "update-gate", id: gate.id, patch: { condition: next } });
                }}
              />
              <span style={{ marginLeft: 4 }}>fire only if</span>
            </label>
            {gate.condition && (
              <>
                <select
                  value={gate.condition.clbit}
                  onChange={(e) => dispatch({ type: "update-gate", id: gate.id, patch: { condition: { ...gate.condition!, clbit: parseInt(e.target.value, 10) } } })}
                >
                  {clbitOptions.map((ci) => (
                    <option key={ci} value={ci}>c{ci}</option>
                  ))}
                </select>
                <span style={{ color: "var(--muted)" }}>==</span>
                <select
                  value={gate.condition.value}
                  onChange={(e) => dispatch({ type: "update-gate", id: gate.id, patch: { condition: { ...gate.condition!, value: parseInt(e.target.value, 10) } } })}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                </select>
              </>
            )}
          </div>
        </fieldset>
      )}

      <fieldset className="inspector__group">
        <legend>Annotation</legend>
        <div className="inspector__row">
          <input
            type="text"
            value={gate.annotation ?? ""}
            placeholder="research note, label, citation…"
            onChange={(e) => {
              const text = e.target.value;
              const patch = text.length > 0 ? { annotation: text } : { annotation: undefined };
              dispatch({ type: "update-gate", id: gate.id, patch });
            }}
            title="Free-form text pinned to this gate. Round-trips through QASM as a // note: comment."
          />
        </div>
      </fieldset>

      {def.description && <p className="inspector__desc">{def.description}</p>}
    </div>
  );
}
