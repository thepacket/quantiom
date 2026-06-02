import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { simulateNoisy, noisyExpectationObservable } from "./simulateNoisy";
import { evaluateObservable, type Pauli, type Observable } from "./expectation";
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

export type OptimizerKind = "sgd" | "adam";

export type OptimizerOptions = {
  symbols: string[];
  /** Observable to optimise — either a single Pauli string (legacy) or a
   *  weighted Pauli-sum Hamiltonian. */
  observable: Pauli[] | Observable;
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
  /** Algorithm. Default Adam (better on rugged landscapes). */
  optimizer?: OptimizerKind;
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
  const kind: OptimizerKind = options.optimizer ?? "adam";
  let lastValue = evaluate(circuit, customGates, params, options.observable, noise);

  // Adam state.
  const beta1 = 0.9;
  const beta2 = 0.999;
  const adamEps = 1e-8;
  const m = new Array<number>(symbols.length).fill(0);
  const v = new Array<number>(symbols.length).fill(0);

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
      grad[i] = sign * (ePlus - eMinus) / (2 * epsilon);
    }

    // Apply update.
    let normSq = 0;
    if (kind === "adam") {
      const t = step + 1;
      const biasCorr1 = 1 - Math.pow(beta1, t);
      const biasCorr2 = 1 - Math.pow(beta2, t);
      for (let i = 0; i < symbols.length; i++) {
        const g = grad[i];
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        const mHat = m[i] / biasCorr1;
        const vHat = v[i] / biasCorr2;
        const delta = lr * mHat / (Math.sqrt(vHat) + adamEps);
        params[symbols[i]] = (params[symbols[i]] ?? 0) - delta;
        normSq += g * g;
      }
    } else {
      for (let i = 0; i < symbols.length; i++) {
        params[symbols[i]] = (params[symbols[i]] ?? 0) - lr * grad[i];
        normSq += grad[i] * grad[i];
      }
    }
    lastValue = evaluate(circuit, customGates, params, options.observable, noise);

    const cont = options.onProgress?.(step + 1, lastValue, params);
    if (cont === false) {
      return { steps: step + 1, finalValue: lastValue, finalParams: params, stopped: "cancelled" };
    }
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
  observable: Pauli[] | Observable,
  noise: NoiseModel | undefined,
): number {
  const obs = toObservable(observable);
  if (noise?.enabled) {
    return noisyExpectationObservable(circuit, params, customGates, noise, obs);
  }
  const result = simulate(circuit, params, customGates);
  if (result.isStabilizer) return 0; // optimization not meaningful in Clifford-only
  return evaluateObservable(result.state, circuit.numQubits, obs);
}

function toObservable(o: Pauli[] | Observable): Observable {
  if (Array.isArray(o)) return { kind: "pauli", paulis: o };
  return o;
}

// Re-export for convenience even though only `optimizeExpectation` is the
// public surface.
export { simulateNoisy };

/**
 * Zero-noise extrapolation. Runs the circuit at noise rates scaled by
 * each factor in `scales` (e.g. [1, 2, 3]), then linearly fits ⟨P⟩(γ)
 * and returns the value extrapolated to γ = 0 along with the sample
 * points. Researchers paired this with VQE/QAOA under calibrated noise:
 * compute ⟨H⟩ at increasingly noisy versions of the device profile, fit,
 * read off the noise-free estimate.
 *
 * The "scale" multiplies every depolarising, damping, readout, and
 * crosstalk rate; per-qubit overrides scale too. Custom Kraus operators
 * pass through unchanged (scaling Kraus is ill-defined in general).
 */
export function zneFit(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  baseNoise: NoiseModel,
  scales: number[] = [1, 2, 3],
): { samples: Array<{ scale: number; value: number }>; extrapolated: number } {
  const obs = Array.isArray(observable) ? { kind: "pauli" as const, paulis: observable } : observable;
  const samples: Array<{ scale: number; value: number }> = [];
  for (const s of scales) {
    const scaled = scaleNoise(baseNoise, s);
    const v = noisyExpectationObservable(circuit, paramValues, customGates, scaled, obs);
    samples.push({ scale: s, value: v });
  }
  // Linear least-squares fit y = a + b·x.
  const n = samples.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const { scale, value } of samples) {
    sx += scale; sy += value; sxx += scale * scale; sxy += scale * value;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { samples, extrapolated: samples[0]?.value ?? 0 };
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  return { samples, extrapolated: a };
}

function scaleNoise(noise: NoiseModel, factor: number): NoiseModel {
  const clamp = (v: number) => Math.max(0, Math.min(1, v * factor));
  return {
    ...noise,
    oneQubitDepolarising: clamp(noise.oneQubitDepolarising),
    twoQubitDepolarising: clamp(noise.twoQubitDepolarising),
    amplitudeDamping: clamp(noise.amplitudeDamping),
    phaseDamping: clamp(noise.phaseDamping),
    readoutBitFlip: clamp(noise.readoutBitFlip),
    crosstalk: clamp(noise.crosstalk),
    perQubit: noise.perQubit?.map((p) => ({
      oneQubitDepolarising: p.oneQubitDepolarising !== undefined ? clamp(p.oneQubitDepolarising) : undefined,
      amplitudeDamping: p.amplitudeDamping !== undefined ? clamp(p.amplitudeDamping) : undefined,
      phaseDamping: p.phaseDamping !== undefined ? clamp(p.phaseDamping) : undefined,
      readoutBitFlip: p.readoutBitFlip !== undefined ? clamp(p.readoutBitFlip) : undefined,
    })),
  };
}

/**
 * Sweep one or two free symbols across [-π, π] (or a user-supplied range)
 * and return a grid of ⟨P⟩ values. Used by the Landscape sub-panel to
 * render a 1D curve (one symbol) or 2D heatmap (two symbols). 32×32 is
 * a reasonable default — 1 024 sim calls finish under a second for
 * n ≤ 10.
 */
export function computeLandscape(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  symbols: string[],
  grid: number,
  range: [number, number],
  noise?: NoiseModel,
): number[][] {
  if (symbols.length < 1 || symbols.length > 2) {
    throw new Error("landscape supports 1 or 2 symbols");
  }
  const [lo, hi] = range;
  const params: ParameterValues = { ...paramValues };
  const out: number[][] = [];
  if (symbols.length === 1) {
    const [sym] = symbols;
    const row: number[] = [];
    for (let i = 0; i < grid; i++) {
      params[sym] = lo + (hi - lo) * (i / (grid - 1));
      row.push(evalAt(circuit, params, customGates, observable, noise));
    }
    out.push(row);
  } else {
    const [sx, sy] = symbols;
    for (let j = 0; j < grid; j++) {
      params[sy] = lo + (hi - lo) * (j / (grid - 1));
      const row: number[] = [];
      for (let i = 0; i < grid; i++) {
        params[sx] = lo + (hi - lo) * (i / (grid - 1));
        row.push(evalAt(circuit, params, customGates, observable, noise));
      }
      out.push(row);
    }
  }
  return out;
}

function evalAt(
  circuit: Circuit,
  params: ParameterValues,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  noise: NoiseModel | undefined,
): number {
  return evaluate(circuit, customGates, params, observable, noise);
}

/**
 * Barren-plateau diagnostic. Samples `samples` uniformly random points
 * over [-π, π] for each symbol, computes the central-difference gradient
 * at each point, returns the per-symbol gradient variance. A value
 * exponentially small in n is the textbook signature of a barren plateau
 * — the ansatz is essentially un-trainable from a random init.
 */
export function barrenPlateauDiagnostic(
  circuit: Circuit,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  symbols: string[],
  samples: number,
  noise?: NoiseModel,
): { variancePerSymbol: number[]; meanGradPerSymbol: number[] } {
  const eps = 1e-3;
  const grads: number[][] = symbols.map(() => []);
  const params: ParameterValues = {};
  for (let s = 0; s < samples; s++) {
    for (const sym of symbols) params[sym] = (Math.random() * 2 - 1) * Math.PI;
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const original = params[sym];
      params[sym] = original + eps;
      const ePlus = evalAt(circuit, params, customGates, observable, noise);
      params[sym] = original - eps;
      const eMinus = evalAt(circuit, params, customGates, observable, noise);
      params[sym] = original;
      grads[i].push((ePlus - eMinus) / (2 * eps));
    }
  }
  const variancePerSymbol = grads.map((g) => variance(g));
  const meanGradPerSymbol = grads.map((g) => g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
  return { variancePerSymbol, meanGradPerSymbol };
}

function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  let m = 0;
  for (const x of xs) m += x;
  m /= xs.length;
  let v = 0;
  for (const x of xs) v += (x - m) * (x - m);
  return v / xs.length;
}
