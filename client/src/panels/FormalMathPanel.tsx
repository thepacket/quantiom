import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import { fetchUnitary, type UnitaryResponse } from "../api";
import { Tex } from "./Tex";
import { PanelShell } from "./PanelShell";

type Props = { circuit: Circuit };

type State =
  | { kind: "idle" }
  | { kind: "loading"; data: UnitaryResponse | null }
  | { kind: "ready"; data: UnitaryResponse }
  | { kind: "error"; message: string; data: UnitaryResponse | null };

const DEBOUNCE_MS = 350;
const MAX_QUBITS_FOR_UNITARY = 4;

export function FormalMathPanel({ circuit }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const lastDataRef = useRef<UnitaryResponse | null>(null);
  const aborterRef = useRef<AbortController | null>(null);
  const tooLarge = circuit.numQubits > MAX_QUBITS_FOR_UNITARY;

  useEffect(() => {
    if (tooLarge) {
      lastDataRef.current = null;
      setState({ kind: "idle" });
      return;
    }
    const handle = setTimeout(() => {
      aborterRef.current?.abort();
      const ac = new AbortController();
      aborterRef.current = ac;
      setState({ kind: "loading", data: lastDataRef.current });
      fetchUnitary(circuit, {}, ac.signal)
        .then((data) => {
          lastDataRef.current = data;
          setState({ kind: "ready", data });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          const message = err instanceof Error ? err.message : String(err);
          setState({ kind: "error", message, data: lastDataRef.current });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [circuit, tooLarge]);

  const loading = state.kind === "loading";
  const data = state.kind === "ready" || state.kind === "loading" || state.kind === "error" ? state.data : null;
  const error = state.kind === "error" ? state.message : null;

  return (
    <PanelShell
      id="formal-math"
      title="Formal math (U)"
      defaultCollapsed
      toolbar={loading ? <span className="panel__spinner">…</span> : null}
    >
      {tooLarge ? (
        <div className="panel__placeholder">
          matrix omitted — {circuit.numQubits} qubits ({1 << circuit.numQubits}² entries)
        </div>
      ) : (<>
      {error && <div className="panel__error">{error}</div>}
      {data && (
        <div className="formal-math__matrix">
          <Tex latex={`U = ${data.latex}`} display />
          {data.skipped.length > 0 && (
            <div className="formal-math__skipped">
              {data.skipped.length} gate{data.skipped.length === 1 ? "" : "s"} skipped (
              {data.skipped.map((s) => s.gateId).join(", ")})
            </div>
          )}
        </div>
      )}
      {!data && !error && <div className="panel__placeholder">computing unitary…</div>}
      </>)}
    </PanelShell>
  );
}
