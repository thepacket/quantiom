import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import { fetchStatevector, type StatevectorResponse } from "../api";

export type SimState =
  | { kind: "idle" }
  | { kind: "loading"; data: StatevectorResponse | null }
  | { kind: "ready"; data: StatevectorResponse }
  | { kind: "error"; message: string; data: StatevectorResponse | null };

export function dataOf(state: SimState): StatevectorResponse | null {
  if (state.kind === "ready" || state.kind === "loading" || state.kind === "error") return state.data;
  return null;
}

const DEBOUNCE_MS = 250;

export function useStatevector(circuit: Circuit): SimState {
  const [state, setState] = useState<SimState>({ kind: "idle" });
  const lastDataRef = useRef<StatevectorResponse | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      aborterRef.current?.abort();
      const ac = new AbortController();
      aborterRef.current = ac;
      setState({ kind: "loading", data: lastDataRef.current });
      fetchStatevector(circuit, ac.signal)
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
  }, [circuit]);

  return state;
}
