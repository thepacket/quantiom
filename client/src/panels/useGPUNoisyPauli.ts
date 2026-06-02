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
 * Pauli strings on the noise path.
 *
 * Scope mirrors `useGPUNoisyProbabilities`: only the 1-qubit-gate +
 * depolarising subset triggers the GPU run, so the CPU
 * `noisyExpectationObservable` stays the source of truth for everything
 * else (any 2q gate, amplitude/phase damping, custom Kraus, measurements,
 * conditions). Returns null until a GPU run completes for the current
 * parameter / circuit / noise tuple; the panel then prefers the GPU value
 * when it's present and falls back to CPU otherwise.
 *
 * The Pauli string is encoded as one entry per qubit ("I"/"X"/"Y"/"Z"
 * with big-endian indexing — qubit 0 is MSB) and is part of the cache key
 * so flipping a single Pauli doesn't thrash the rest of the dispatch.
 */
export function useGPUNoisyPauli(
  circuit: Circuit,
  parameterValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel | undefined,
  enabled: boolean,
  paulis: GPUPauli[] | null,
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
  const pauliKey = paulis ? paulis.join("") : null;

  useEffect(() => {
    if (!noiseEnabled || !noise || !paulis) { setValue(null); return; }
    if (paulis.every((p) => p === "I")) { setValue(1); return; }
    if (!isWebGPUAvailable()) { setValue(null); return; }
    let cancelled = false;
    tryRunWebGPUTrajectories(circuit, parameterValues, customGates, noise, noise.trajectories, paulis)
      .then((r) => {
        if (cancelled) return;
        setValue(r && typeof r.pauliExpectation === "number" ? r.pauliExpectation : null);
      })
      .catch(() => { if (!cancelled) setValue(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseEnabled, noiseKey, paramKey, circuitKey, pauliKey]);

  return value;
}
