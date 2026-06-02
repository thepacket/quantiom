import { useEffect, useState } from "react";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";
import { isWebGPUAvailable, tryRunWebGPUTrajectories, type GPUBlochVector } from "../sim/webgpuTraj";

/**
 * Off-main-thread WebGPU trajectory probabilities for the noise path.
 *
 * Returns `null` until a GPU run completes (or when the GPU path doesn't
 * apply — non-noisy, unsupported gates, or no WebGPU). The Probabilities
 * panel prefers this when present and falls back to the synchronous CPU
 * result otherwise.
 *
 * Scope: only activates when noise is enabled, the circuit fits the
 * WebGPU support set (1-qubit gates + depolarising noise only, see
 * `tryRunWebGPUTrajectories`), and the trajectory count is large enough
 * for the GPU overhead to pay off. Activation is conservative; the goal
 * is not to break the CPU panel's responsiveness.
 *
 * Cancellation: each new (circuit, params, noise) tuple starts a fresh
 * dispatch; previous in-flight runs are dropped via the `cancelled` flag.
 * The cache key is intentionally narrow so user-facing param sweeps
 * (Landscape / Optimise / etc.) don't thrash GPU work the panel won't show.
 */
/**
 * Bundled GPU output: probabilities plus per-qubit Bloch vectors averaged
 * across trajectories. `null` for either means "the GPU path didn't apply
 * for this circuit / noise / param combo, fall back to CPU".
 */
export type GPUNoisyResult = {
  probabilities: number[];
  blochVectors?: GPUBlochVector[];
};

export function useGPUNoisyProbabilities(
  circuit: Circuit,
  parameterValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel | undefined,
  enabled: boolean,
): GPUNoisyResult | null {
  const [result, setResult] = useState<GPUNoisyResult | null>(null);

  // Stable string keys so the effect doesn't fire on every reference change.
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

  useEffect(() => {
    if (!noiseEnabled || !noise) {
      setResult(null);
      return;
    }
    if (!isWebGPUAvailable()) {
      setResult(null);
      return;
    }
    let cancelled = false;
    tryRunWebGPUTrajectories(circuit, parameterValues, customGates, noise, noise.trajectories)
      .then((r) => {
        if (cancelled) return;
        setResult(r ? { probabilities: r.probabilities, blochVectors: r.blochVectors } : null);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseEnabled, noiseKey, paramKey, circuitKey]);

  return result;
}
