import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import { simulate, type ParameterValues } from "./simulate";

/**
 * Unitary-equivalence check between two circuits.
 *
 * Two circuits are equivalent (as quantum operations) iff they implement
 * the same unitary up to an arbitrary global phase: U_A = e^{iφ} U_B.
 *
 * Strategy depends on circuit size:
 *   • n ≤ 8: compute both full 2ⁿ × 2ⁿ unitaries column by column (running
 *     the simulator with each computational basis state as input) and
 *     compare entrywise, factoring out a global phase from the first
 *     nonzero matrix element. Exact within floating-point precision.
 *   • n > 8: sample K random computational basis states, compute the
 *     corresponding columns of both unitaries, and check global-phase
 *     consistency across the sample. Probabilistic — finds inequivalence
 *     with overwhelming probability for any meaningful difference.
 *
 * Free parameters: evaluated with the supplied `paramValues`, just like
 * the live panels. Circuits whose free symbols differ across A/B are
 * still comparable — only the values bound here matter.
 */

export type EquivalenceResult = {
  equivalent: boolean;
  /** Maximum |U_A[i,j] - e^{iφ} U_B[i,j]| across the sampled comparison. */
  maxDeviation: number;
  /** The global phase factored out — the eigenvalue of U_A U_B† if equivalent. */
  globalPhase: number;
  /** True when both unitaries were computed in full. */
  exact: boolean;
  /** Number of columns sampled (= 2ⁿ in the exact case). */
  sampledColumns: number;
  /** Diagnostic: the basis index where the largest deviation occurred. */
  worstColumn: number;
  worstRow: number;
};

/** Threshold above which we declare equivalence in the floating-point sense. */
const EPS = 1e-6;
/** Number of column samples to draw when n > 8. */
const SAMPLE_K = 16;
/** Max qubits for the exact path (memory: 8 × 2 × 4ⁿ bytes). */
const EXACT_MAX_QUBITS = 8;

export function equivalenceCheck(
  circuitA: Circuit,
  circuitB: Circuit,
  customGatesA: CustomGate[],
  customGatesB: CustomGate[],
  paramValues: ParameterValues,
): EquivalenceResult {
  if (circuitA.numQubits !== circuitB.numQubits) {
    return {
      equivalent: false,
      maxDeviation: Infinity,
      globalPhase: 0,
      exact: false,
      sampledColumns: 0,
      worstColumn: -1,
      worstRow: -1,
    };
  }
  const n = circuitA.numQubits;
  const dim = 1 << n;

  const exact = n <= EXACT_MAX_QUBITS;
  const indices = exact
    ? Array.from({ length: dim }, (_, i) => i)
    : sampleIndices(dim, SAMPLE_K);

  // Compute the columns and fold global phase out.
  let globalPhase = 0;
  let phaseLocked = false;
  let maxDev = 0;
  let worstCol = -1;
  let worstRow = -1;

  for (const j of indices) {
    const psiA = simulate(circuitA, paramValues, customGatesA, { startIndex: j }).state;
    const psiB = simulate(circuitB, paramValues, customGatesB, { startIndex: j }).state;

    // Lock the global phase on the first column whose first nonzero entry
    // is large enough to be reliable.
    if (!phaseLocked) {
      for (let i = 0; i < dim; i++) {
        const aRe = psiA[2 * i];
        const aIm = psiA[2 * i + 1];
        const bRe = psiB[2 * i];
        const bIm = psiB[2 * i + 1];
        const mag2 = aRe * aRe + aIm * aIm;
        if (mag2 > 0.01) {
          // ψ_A[i] = e^{iφ} ψ_B[i] ⇒ e^{iφ} = ψ_A[i] / ψ_B[i].
          const denom = bRe * bRe + bIm * bIm;
          if (denom > 1e-12) {
            const cRe = (aRe * bRe + aIm * bIm) / denom;
            const cIm = (aIm * bRe - aRe * bIm) / denom;
            globalPhase = Math.atan2(cIm, cRe);
            phaseLocked = true;
          }
          break;
        }
      }
    }

    if (phaseLocked) {
      const cosP = Math.cos(globalPhase);
      const sinP = Math.sin(globalPhase);
      for (let i = 0; i < dim; i++) {
        const aRe = psiA[2 * i];
        const aIm = psiA[2 * i + 1];
        const bRe = psiB[2 * i];
        const bIm = psiB[2 * i + 1];
        // ψ_B' = e^{iφ} ψ_B
        const bpRe = cosP * bRe - sinP * bIm;
        const bpIm = sinP * bRe + cosP * bIm;
        const dRe = aRe - bpRe;
        const dIm = aIm - bpIm;
        const dev = Math.hypot(dRe, dIm);
        if (dev > maxDev) {
          maxDev = dev;
          worstCol = j;
          worstRow = i;
        }
      }
    }
  }

  // If we never locked a phase (both circuits act trivially on the basis
  // states sampled, e.g. both are identity-on-zeros), they're equivalent.
  if (!phaseLocked) {
    return {
      equivalent: true,
      maxDeviation: 0,
      globalPhase: 0,
      exact,
      sampledColumns: indices.length,
      worstColumn: -1,
      worstRow: -1,
    };
  }

  return {
    equivalent: maxDev < EPS,
    maxDeviation: maxDev,
    globalPhase,
    exact,
    sampledColumns: indices.length,
    worstColumn: worstCol,
    worstRow: worstRow,
  };
}

function sampleIndices(dim: number, k: number): number[] {
  // Always include |0…0⟩ — it's the most common discriminator. Then draw
  // k-1 distinct uniform-random columns. (For small `dim`, fall back to all.)
  if (dim <= k) return Array.from({ length: dim }, (_, i) => i);
  const set = new Set<number>([0]);
  while (set.size < k) {
    set.add(Math.floor(Math.random() * dim));
  }
  return [...set];
}
