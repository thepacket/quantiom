import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { simulateNoisy, noisyPauliExpectation } from "./simulateNoisy";
import { paulis as evalPaulis, type Pauli } from "./expectation";
import type { NoiseModel } from "./noise";

/**
 * Gradient-based optimisation of a Pauli expectation value over the
 * circuit's free symbols. Used by the Expectation panel's Optimize
 * button — gives researchers a one-click VQE / QAOA mini-loop without
 * leaving the browser.
 *
 * Implementation: central finite differences for the gradient,
 * ∂⟨H⟩/∂θ ≈ (E(θ+ε) - E(θ-ε)) / (2ε), then plain gradient descent
 * with a fixed learning rate. Two simulator calls per parameter per
 * step. The exact parameter-shift rule would be more accurate but
 * only applies cleanly when the free symbol enters as the entire gate
 * angle; Quantiom allows arbitrary expressions ("2*θ + π/4"), so finite
 * differences are the universal choice.
 *
 * Noise mode: ⟨H⟩ comes from trajectory averaging. Each gradient step
 * costs `trajectories × (2k+1)` trajectory runs for k symbols, which
 * is slow but well-defined. The caller passes an onProgress callback
 * so the UI can show a live counter and let the user cancel.
 */

export type OptimizerOptions = {
  symbols: string[];
  observable: Pauli[];
  /** Initial parameter values, including non-optimised symbols. */
  initial: ParameterValues;
  /** Steps of gradient descent. */
  steps: number;
  /** Learning rate. */
  learningRate: number;
  /** Finite-difference epsilon. */
  epsilon: number;
  /** Optimisation direction. */
  goal: "minimize" | "maximize";
  /** Called after each step with the current iterate. Return false to stop. */
  onProgress?: (step: number, value: number, params: ParameterValues) => boolean | void;
};

export type OptimizerResult = {
  steps: number;
  finalValue: number;
  finalParams: ParameterValues;
  stopped: "converged" | "max-steps" | "cancelled";
};

export function optimizeExpectation(
  circuit: Circuit,
  customGates: CustomGate[],
  options: OptimizerOptions,
  noise?: NoiseModel,
): OptimizerResult {
  const params: ParameterValues = { ...options.initial };
  const symbols = options.symbols;
  const sign = options.goal === "minimize" ? +1 : -1;
  const epsilon = options.epsilon;
  const lr = options.learningRate;
  let lastValue = evaluate(circuit, customGates, params, options.observable, noise);

  for (let step = 0; step < options.steps; step++) {
    // Central finite differences per symbol.
    const grad = new Array<number>(symbols.length);
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const original = params[sym] ?? 0;
      params[sym] = original + epsilon;
      const ePlus = evaluate(circuit, customGates, params, options.observable, noise);
      params[sym] = original - epsilon;
      const eMinus = evaluate(circuit, customGates, params, options.observable, noise);
      params[sym] = original;
      grad[i] = (ePlus - eMinus) / (2 * epsilon);
    }

    // Gradient step (sign flips for maximise).
    let normSq = 0;
    for (let i = 0; i < symbols.length; i++) {
      const delta = sign * lr * grad[i];
      params[symbols[i]] = (params[symbols[i]] ?? 0) - delta;
      normSq += grad[i] * grad[i];
    }
    lastValue = evaluate(circuit, customGates, params, options.observable, noise);

    const cont = options.onProgress?.(step + 1, lastValue, params);
    if (cont === false) {
      return { steps: step + 1, finalValue: lastValue, finalParams: params, stopped: "cancelled" };
    }
    // Convergence: tiny gradient.
    if (Math.sqrt(normSq) < 1e-6) {
      return { steps: step + 1, finalValue: lastValue, finalParams: params, stopped: "converged" };
    }
  }
  return { steps: options.steps, finalValue: lastValue, finalParams: params, stopped: "max-steps" };
}

function evaluate(
  circuit: Circuit,
  customGates: CustomGate[],
  params: ParameterValues,
  observable: Pauli[],
  noise: NoiseModel | undefined,
): number {
  if (noise?.enabled) {
    return noisyPauliExpectation(circuit, params, customGates, noise, observable);
  }
  const result = simulate(circuit, params, customGates);
  if (result.isStabilizer) return 0; // optimization not meaningful in Clifford-only
  return evalPaulis(result.state, circuit.numQubits, observable);
}

// Re-export for convenience even though only `optimizeExpectation` is the
// public surface.
export { simulateNoisy };
