import { useMemo } from "react";
import type { Circuit } from "../editor/types";
import { simulate, type ParameterValues, type SimResult } from "../sim/simulate";
import { simulateNoisy } from "../sim/simulateNoisy";
import type { NoiseModel } from "../sim/noise";
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
  noise?: NoiseModel,
): SimState {
  // Default-fast: when noise is disabled (the common case), the noise object
  // is never read past the `enabled` check, so the dep array doesn't trigger
  // re-renders on noise parameter tweaks while disabled.
  const noiseEnabled = noise?.enabled === true;
  const noiseKey = noiseEnabled
    ? `${noise!.oneQubitDepolarising}|${noise!.twoQubitDepolarising}|${noise!.trajectories}`
    : null;
  return useMemo<SimState>(() => {
    try {
      const data = noiseEnabled
        ? simulateNoisy(circuit, parameterValues, customGates, noise!)
        : simulate(circuit, parameterValues, customGates);
      return { kind: "ready", data };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { kind: "error", message, data: null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit, parameterValues, customGates, noiseEnabled, noiseKey]);
}
