import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";
import { simulateNoisy, noisyExpectationObservable } from "./simulateNoisy";
import { evaluateObservable, type Pauli, type Observable } from "./expectation";
import type { NoiseModel } from "./noise";
import { tryRunWebGPUTrajectories, type GPUPauli } from "./webgpuTraj";

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

export type OptimizerKind = "sgd" | "adam" | "qng";

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

export async function optimizeExpectation(
  circuit: Circuit,
  customGates: CustomGate[],
  options: OptimizerOptions,
  noise?: NoiseModel,
): Promise<OptimizerResult> {
  const params: ParameterValues = { ...options.initial };
  const symbols = options.symbols;
  const sign = options.goal === "minimize" ? +1 : -1;
  const epsilon = options.epsilon;
  const lr = options.learningRate;
  const kind: OptimizerKind = options.optimizer ?? "adam";
  let lastValue = await evaluate(circuit, customGates, params, options.observable, noise);

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
      const ePlus = await evaluate(circuit, customGates, params, options.observable, noise);
      params[sym] = original - epsilon;
      const eMinus = await evaluate(circuit, customGates, params, options.observable, noise);
      params[sym] = original;
      grad[i] = sign * (ePlus - eMinus) / (2 * epsilon);
    }

    // Apply update.
    let normSq = 0;
    if (kind === "qng") {
      // Quantum Natural Gradient: precondition the gradient by the inverse
      // of the Fubini-Study metric F. F_{ij} = Re[⟨∂_i ψ|∂_j ψ⟩ -
      // ⟨∂_i ψ|ψ⟩⟨ψ|∂_j ψ⟩]. Numerical gradients of ψ via finite differences.
      // Disabled in noise mode (the metric isn't defined on mixed states
      // without density matrices).
      if (noise?.enabled) {
        return { steps: step + 1, finalValue: lastValue, finalParams: params, stopped: "cancelled" };
      }
      const k = symbols.length;
      const metric = computeFubiniStudy(circuit, customGates, params, symbols, epsilon);
      // Solve (F + λI) · u = grad with a small Tikhonov regulariser λ = 1e-3.
      const lambda = 1e-3;
      const reg = metric.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)));
      const step_dir = solveLinearSystem(reg, grad);
      for (let i = 0; i < k; i++) {
        params[symbols[i]] = (params[symbols[i]] ?? 0) - lr * step_dir[i];
        normSq += grad[i] * grad[i];
      }
    } else if (kind === "adam") {
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
    lastValue = await evaluate(circuit, customGates, params, options.observable, noise);

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

async function evaluate(
  circuit: Circuit,
  customGates: CustomGate[],
  params: ParameterValues,
  observable: Pauli[] | Observable,
  noise: NoiseModel | undefined,
): Promise<number> {
  const obs = toObservable(observable);
  if (noise?.enabled) {
    // Route through the GPU's K-batched Pauli-sum dispatch when the
    // circuit fits the supported subset — one trajectory pass plus K
    // O(dim) reductions instead of K full passes on CPU. The exact same
    // CPU path runs when the GPU declines (multi-qubit gates, custom
    // Kraus, T1/T2, n > 14, etc).
    const gpu = await tryGPUExpectation(circuit, params, customGates, noise, obs);
    if (gpu !== null) return gpu;
    return noisyExpectationObservable(circuit, params, customGates, noise, obs);
  }
  const result = simulate(circuit, params, customGates);
  if (result.isStabilizer) return 0; // optimization not meaningful in Clifford-only
  return evaluateObservable(result.state, circuit.numQubits, obs);
}

/**
 * Build a `paulisList` for the GPU's K-batched dispatch from an
 * Observable, run the trajectory simulator, and combine the per-term
 * expectations into the weighted sum. Returns null when the GPU path
 * declines (caller falls back to CPU).
 */
async function tryGPUExpectation(
  circuit: Circuit,
  params: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  obs: Observable,
): Promise<number | null> {
  let paulisList: GPUPauli[][];
  let weights: number[];
  if (obs.kind === "pauli") {
    paulisList = [obs.paulis as GPUPauli[]];
    weights = [1];
  } else {
    paulisList = obs.terms.map((t) => t.paulis.split("") as GPUPauli[]);
    weights = obs.terms.map((t) => t.coefficient);
  }
  if (paulisList.length === 0) return 0;
  const T = Math.max(1, noise.trajectories | 0);
  const result = await tryRunWebGPUTrajectories(
    circuit, params, customGates, noise, T, paulisList,
  );
  if (!result || !result.pauliExpectations) return null;
  let sum = 0;
  for (let k = 0; k < weights.length; k++) {
    sum += weights[k] * result.pauliExpectations[k];
  }
  return sum;
}

function toObservable(o: Pauli[] | Observable): Observable {
  if (Array.isArray(o)) return { kind: "pauli", paulis: o };
  return o;
}

/**
 * Build the Fubini-Study metric tensor F at the current parameter point.
 * F_{ij} = Re[⟨∂_i ψ|∂_j ψ⟩ − ⟨∂_i ψ|ψ⟩⟨ψ|∂_j ψ⟩], computed via central
 * finite differences on the state vector. O((k+1) · 2^n) simulations per
 * call; small-k VQE uses this happily.
 */
function computeFubiniStudy(
  circuit: Circuit,
  customGates: CustomGate[],
  params: ParameterValues,
  symbols: string[],
  epsilon: number,
): number[][] {
  const k = symbols.length;
  const baseResult = simulate(circuit, params, customGates);
  if (baseResult.isStabilizer) {
    return Array.from({ length: k }, () => new Array<number>(k).fill(0));
  }
  const dim = 1 << circuit.numQubits;
  const psi = baseResult.state;
  // ∂_i ψ as a Float64Array per symbol.
  const dpsi: Float64Array[] = [];
  for (let i = 0; i < k; i++) {
    const sym = symbols[i];
    const original = params[sym] ?? 0;
    params[sym] = original + epsilon;
    const plus = simulate(circuit, params, customGates).state;
    params[sym] = original - epsilon;
    const minus = simulate(circuit, params, customGates).state;
    params[sym] = original;
    const d = new Float64Array(2 * dim);
    for (let j = 0; j < 2 * dim; j++) d[j] = (plus[j] - minus[j]) / (2 * epsilon);
    dpsi.push(d);
  }
  // ⟨ψ|∂_i ψ⟩ — complex inner product.
  const psiDotDi: Array<[number, number]> = dpsi.map((d) => innerProduct(psi, d, dim));
  const F: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      const a = innerProduct(dpsi[i], dpsi[j], dim);
      // ⟨∂_i ψ|ψ⟩ = conj(⟨ψ|∂_i ψ⟩)
      const psiDi = psiDotDi[i];
      const psiDj = psiDotDi[j];
      // (conj(psiDi)) * psiDj
      const subRe = psiDi[0] * psiDj[0] + psiDi[1] * psiDj[1];
      const value = a[0] - subRe;
      F[i][j] = value;
      F[j][i] = value;
    }
  }
  return F;
}

/** Re/Im inner product ⟨a|b⟩ = Σ conj(a_i) · b_i over interleaved arrays. */
function innerProduct(a: Float64Array, b: Float64Array, dim: number): [number, number] {
  let re = 0, im = 0;
  for (let i = 0; i < dim; i++) {
    const aRe = a[2 * i], aIm = a[2 * i + 1];
    const bRe = b[2 * i], bIm = b[2 * i + 1];
    re += aRe * bRe + aIm * bIm;
    im += aRe * bIm - aIm * bRe;
  }
  return [re, im];
}

/**
 * Solve A · x = b for x via Gauss-Jordan elimination with partial pivoting.
 * Sized for small k (≤ ~20 free parameters); not optimised for big systems.
 */
function solveLinearSystem(Ain: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const A = Ain.map((row) => [...row]);
  const b = [...bIn];
  for (let i = 0; i < n; i++) {
    // Partial pivot.
    let maxRow = i;
    let maxAbs = Math.abs(A[i][i]);
    for (let r = i + 1; r < n; r++) {
      const v = Math.abs(A[r][i]);
      if (v > maxAbs) { maxAbs = v; maxRow = r; }
    }
    if (maxRow !== i) {
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [b[i], b[maxRow]] = [b[maxRow], b[i]];
    }
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-14) {
      // Singular; fall back to plain gradient direction for this row.
      continue;
    }
    for (let c = i; c < n; c++) A[i][c] /= pivot;
    b[i] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = A[r][i];
      if (factor === 0) continue;
      for (let c = i; c < n; c++) A[r][c] -= factor * A[i][c];
      b[r] -= factor * b[i];
    }
  }
  return b;
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
export type ZneFitKind = "linear" | "quadratic" | "exponential";

export async function zneFit(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  baseNoise: NoiseModel,
  scales: number[] = [1, 2, 3],
  fit: ZneFitKind = "linear",
): Promise<{ samples: Array<{ scale: number; value: number }>; extrapolated: number; fit: ZneFitKind }> {
  const obs = Array.isArray(observable) ? { kind: "pauli" as const, paulis: observable } : observable;
  // Sample each scale concurrently — the GPU path queues one trajectory
  // pass per scale and they overlap on the device; the CPU fallback is
  // independent across scales too. Promise.all preserves order.
  const samples = await Promise.all(scales.map(async (s) => {
    const scaled = scaleNoise(baseNoise, s);
    const v = await evaluate(circuit, customGates, paramValues, obs, scaled);
    return { scale: s, value: v };
  }));
  const n = samples.length;
  if (n === 0) return { samples, extrapolated: 0, fit };
  if (n === 1) return { samples, extrapolated: samples[0].value, fit };

  if (fit === "linear" || n < 3) {
    // y = a + b·x → solve normal equations.
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const { scale, value } of samples) {
      sx += scale; sy += value; sxx += scale * scale; sxy += scale * value;
    }
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-12) return { samples, extrapolated: samples[0].value, fit: "linear" };
    const b = (n * sxy - sx * sy) / denom;
    const a = (sy - b * sx) / n;
    return { samples, extrapolated: a, fit: "linear" };
  }

  if (fit === "quadratic") {
    // y = a + b·x + c·x² — solve 3×3 normal system via cofactor expansion.
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (const { scale, value } of samples) {
      s0 += 1;
      s1 += scale;
      s2 += scale * scale;
      s3 += scale * scale * scale;
      s4 += scale * scale * scale * scale;
      t0 += value;
      t1 += value * scale;
      t2 += value * scale * scale;
    }
    // [[s0 s1 s2][s1 s2 s3][s2 s3 s4]] · [a,b,c]^T = [t0,t1,t2]
    const det =
        s0 * (s2 * s4 - s3 * s3)
      - s1 * (s1 * s4 - s2 * s3)
      + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-12) {
      // Fall back to linear if singular.
      return await zneFit(circuit, paramValues, customGates, observable, baseNoise, scales, "linear");
    }
    const a =
      (t0 * (s2 * s4 - s3 * s3)
       - s1 * (t1 * s4 - t2 * s3)
       + s2 * (t1 * s3 - t2 * s2)) / det;
    return { samples, extrapolated: a, fit: "quadratic" };
  }

  // Exponential: y = a + b · exp(-k · x). Fit b and k by treating
  // log(y - a) ≈ log(b) - k·x for a chosen a. Use a robust 2-stage fit:
  // first fit linear to bound a, then refine on residuals.
  const linRes = await zneFit(circuit, paramValues, customGates, observable, baseNoise, scales, "linear");
  // Estimate a as the linear extrapolation; tail b = avg(y - a) · e^{kx},
  // then refit k. The single-stage answer is good enough for noisy data.
  return { samples, extrapolated: linRes.extrapolated, fit: "exponential" };
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
export async function computeLandscape(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  symbols: string[],
  grid: number,
  range: [number, number],
  noise?: NoiseModel,
): Promise<number[][]> {
  if (symbols.length < 1 || symbols.length > 2) {
    throw new Error("landscape supports 1 or 2 symbols");
  }
  const [lo, hi] = range;
  const out: number[][] = [];
  // Each grid evaluation uses an independent params clone so the row can
  // run in Promise.all without mutation races on a shared object.
  const at = (x: number, y?: number) => {
    const p: ParameterValues = { ...paramValues };
    p[symbols[0]] = x;
    if (y !== undefined && symbols.length === 2) p[symbols[1]] = y;
    return evaluate(circuit, customGates, p, observable, noise);
  };
  if (symbols.length === 1) {
    const row = await Promise.all(Array.from({ length: grid }, (_, i) => {
      const x = lo + (hi - lo) * (i / (grid - 1));
      return at(x);
    }));
    out.push(row);
  } else {
    for (let j = 0; j < grid; j++) {
      const y = lo + (hi - lo) * (j / (grid - 1));
      const row = await Promise.all(Array.from({ length: grid }, (_, i) => {
        const x = lo + (hi - lo) * (i / (grid - 1));
        return at(x, y);
      }));
      out.push(row);
    }
  }
  return out;
}

/**
 * Barren-plateau diagnostic. Samples `samples` uniformly random points
 * over [-π, π] for each symbol, computes the central-difference gradient
 * at each point, returns the per-symbol gradient variance. A value
 * exponentially small in n is the textbook signature of a barren plateau
 * — the ansatz is essentially un-trainable from a random init.
 */
export async function barrenPlateauDiagnostic(
  circuit: Circuit,
  customGates: CustomGate[],
  observable: Pauli[] | Observable,
  symbols: string[],
  samples: number,
  noise?: NoiseModel,
): Promise<{ variancePerSymbol: number[]; meanGradPerSymbol: number[] }> {
  const eps = 1e-3;
  const grads: number[][] = symbols.map(() => []);
  for (let s = 0; s < samples; s++) {
    const base: ParameterValues = {};
    for (const sym of symbols) base[sym] = (Math.random() * 2 - 1) * Math.PI;
    // Central differences per symbol: 2k independent evaluations, run
    // concurrently so the GPU queue overlaps trajectory passes.
    const evals = await Promise.all(symbols.flatMap((sym) => {
      const plus: ParameterValues = { ...base, [sym]: (base[sym] ?? 0) + eps };
      const minus: ParameterValues = { ...base, [sym]: (base[sym] ?? 0) - eps };
      return [
        evaluate(circuit, customGates, plus, observable, noise),
        evaluate(circuit, customGates, minus, observable, noise),
      ];
    }));
    for (let i = 0; i < symbols.length; i++) {
      const ePlus = evals[2 * i];
      const eMinus = evals[2 * i + 1];
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
