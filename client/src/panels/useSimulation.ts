import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import { fetchStatevector, type ParameterValues, type StatevectorResponse } from "../api";

export type SimState =
  | { kind: "idle" }
  | { kind: "loading"; data: StatevectorResponse | null }
  | { kind: "ready"; data: StatevectorResponse }
  | { kind: "error"; message: string; data: StatevectorResponse | null };

export function dataOf(state: SimState): StatevectorResponse | null {
  if (state.kind === "ready" || state.kind === "loading" || state.kind === "error") return state.data;
  return null;
}

// Short debounce so playback streams updates; the single-flight queue below
// keeps in-flight count to at most 1 regardless of how fast inputs change.
const DEBOUNCE_MS = 60;

export function useStatevector(circuit: Circuit, parameterValues: ParameterValues): SimState {
  const [state, setState] = useState<SimState>({ kind: "idle" });
  const lastDataRef = useRef<StatevectorResponse | null>(null);
  const aborterRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<{ circuit: Circuit; params: ParameterValues } | null>(null);

  useEffect(() => {
    const fire = (c: Circuit, p: ParameterValues) => {
      if (inFlightRef.current) {
        // Replace the queued request so we always converge on the latest input.
        pendingRef.current = { circuit: c, params: p };
        return;
      }
      inFlightRef.current = true;
      const ac = new AbortController();
      aborterRef.current = ac;
      setState({ kind: "loading", data: lastDataRef.current });
      fetchStatevector(c, p, ac.signal)
        .then((data) => {
          lastDataRef.current = data;
          setState({ kind: "ready", data });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          const message = err instanceof Error ? err.message : String(err);
          setState({ kind: "error", message, data: lastDataRef.current });
        })
        .finally(() => {
          inFlightRef.current = false;
          const queued = pendingRef.current;
          if (queued) {
            pendingRef.current = null;
            fire(queued.circuit, queued.params);
          }
        });
    };

    const handle = setTimeout(() => fire(circuit, parameterValues), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [circuit, parameterValues]);

  return state;
}
