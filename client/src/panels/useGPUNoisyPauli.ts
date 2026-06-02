import { useEffect, useState } from "react";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";
import {
  isWebGPUAvailable,
  tryRunWebGPUTrajectories,
  type GPUPauli,
} from "../sim/webgpuTraj";

/**
 * Off-main-thread WebGPU trajectory-averaged ⟨P⟩ for arbitrary multi-qubit
 * Pauli strings (and weighted Pauli-sum Hamiltonians) on the noise path.
 *
 * Scope mirrors `useGPUNoisyProbabilities`: only the 1-qubit-gate +
 * depolarising subset triggers the GPU run, so the CPU
 * `noisyExpectationObservable` stays the source of truth for everything
 * else (any 2q gate, amplitude/phase damping, custom Kraus, measurements,
 * conditions). Returns null until a GPU run completes for the current
 * parameter / circuit / noise tuple; the panel prefers the GPU value when
 * present and falls back to CPU otherwise.
 *
 * For Pauli sums H = Σ_k h_k P_k we fire one dispatch per term and sum
 * the weighted results on the CPU. Each dispatch re-runs the trajectory
 * loop on the GPU (a future optimisation would batch K Pauli strings
 * into a single shader pass to amortise the gate sequence), but even K
 * dispatches keep the main thread free for UI.
 *
 * Big-endian: qubit 0 is MSB, matching the rest of the codebase.
 */
export type GPUObservable =
  | { kind: "pauli"; paulis: GPUPauli[] }
  | { kind: "sum"; terms: Array<{ coefficient: number; paulis: GPUPauli[] }> };

export function useGPUNoisyPauli(
  circuit: Circuit,
  parameterValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel | undefined,
  enabled: boolean,
  observable: GPUObservable | null,
): number | null {
  const [value, setValue] = useState<number | null>(null);

  const noiseEnabled = enabled && !!noise?.enabled;
  const noiseKey = noiseEnabled
    ? `${noise!.oneQubitDepolarising}|${noise!.trajectories}`
    : null;
  const paramKey = noiseEnabled ? JSON.stringify(parameterValues) : null;
  const circuitKey = noiseEnabled
    ? `${circuit.numQubits}|${circuit.gates.length}|${circuit.gates
        .map((g) => `${g.gateId}@${g.column}:${g.targets.join(",")}`)
        .join(";")}`
    : null;
  const obsKey = observable
    ? observable.kind === "pauli"
      ? `P:${observable.paulis.join("")}`
      : `S:${observable.terms.map((t) => `${t.coefficient}|${t.paulis.join("")}`).join(";")}`
    : null;

  useEffect(() => {
    if (!noiseEnabled || !noise || !observable) { setValue(null); return; }
    if (!isWebGPUAvailable()) { setValue(null); return; }
    let cancelled = false;
    const run = async (): Promise<number | null> => {
      if (observable.kind === "pauli") {
        if (observable.paulis.every((p) => p === "I")) return 1;
        const r = await tryRunWebGPUTrajectories(
          circuit, parameterValues, customGates, noise, noise.trajectories, observable.paulis,
        );
        return r && typeof r.pauliExpectation === "number" ? r.pauliExpectation : null;
      }
      // Sum: weighted sum over per-term GPU dispatches.
      let total = 0;
      for (const term of observable.terms) {
        if (term.coefficient === 0) continue;
        if (term.paulis.every((p) => p === "I")) { total += term.coefficient; continue; }
        const r = await tryRunWebGPUTrajectories(
          circuit, parameterValues, customGates, noise, noise.trajectories, term.paulis,
        );
        if (!r || typeof r.pauliExpectation !== "number") return null;
        total += term.coefficient * r.pauliExpectation;
      }
      return total;
    };
    run()
      .then((v) => { if (!cancelled) setValue(v); })
      .catch(() => { if (!cancelled) setValue(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseEnabled, noiseKey, paramKey, circuitKey, obsKey]);

  return value;
}
