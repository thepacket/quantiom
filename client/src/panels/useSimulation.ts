import { useMemo } from "react";
import type { Circuit } from "../editor/types";
import { simulate, type ParameterValues, type SimResult } from "../sim/simulate";
import type { CustomGate } from "../editor/customGates";

/** Backwards-compatible wrapper shape used by panel components. */
export type SimState =
  | { kind: "idle" }
  | { kind: "ready"; data: SimResult }
  | { kind: "error"; message: string; data: SimResult | null };

export function dataOf(state: SimState): SimResult | null {
  if (state.kind === "ready" || state.kind === "error") return state.data;
  return null;
}

/**
 * Run the client-side simulator synchronously and memoise on (circuit,
 * parameterValues). No network, no debounce, no in-flight tracking — the
 * simulator is fast enough that React re-renders absorb the work.
 */
export function useStatevector(
  circuit: Circuit,
  parameterValues: ParameterValues,
  customGates: CustomGate[] = [],
): SimState {
  return useMemo<SimState>(() => {
    try {
      const data = simulate(circuit, parameterValues, customGates);
      return { kind: "ready", data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { kind: "error", message, data: null };
    }
  }, [circuit, parameterValues, customGates]);
}
