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
 * For Pauli sums H = Σ_k h_k P_k we batch all K terms into a single GPU
 * dispatch — the shader simulates the trajectories once and then runs K
 * reductions to produce K ⟨P_k⟩ values, which the CPU weights and sums.
 * Cost is one trajectory pass plus K · O(dim) reductions, not K full
 * passes (the earlier per-term-dispatch implementation).
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
      // Build the list of (coefficient, paulis) the GPU needs to evaluate,
      // pre-deducting any identity terms (which contribute coefficient × 1
      // by themselves — no shader work required).
      let identityContribution = 0;
      const dispatchTerms: Array<{ coefficient: number; paulis: GPUPauli[] }> = [];
      if (observable.kind === "pauli") {
        if (observable.paulis.every((p) => p === "I")) return 1;
        dispatchTerms.push({ coefficient: 1, paulis: observable.paulis });
      } else {
        for (const term of observable.terms) {
          if (term.coefficient === 0) continue;
          if (term.paulis.every((p) => p === "I")) {
            identityContribution += term.coefficient;
            continue;
          }
          dispatchTerms.push(term);
        }
      }
      if (dispatchTerms.length === 0) return identityContribution;
      const r = await tryRunWebGPUTrajectories(
        circuit, parameterValues, customGates, noise, noise.trajectories,
        dispatchTerms.map((t) => t.paulis),
      );
      if (!r || !r.pauliExpectations || r.pauliExpectations.length !== dispatchTerms.length) {
        return null;
      }
      let total = identityContribution;
      for (let k = 0; k < dispatchTerms.length; k++) {
        total += dispatchTerms[k].coefficient * r.pauliExpectations[k];
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
