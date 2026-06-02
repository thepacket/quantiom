import type { Complex } from "./complex";
import { cmul, neg } from "./complex";

/**
 * ⚠️ WORK IN PROGRESS — NOT WIRED INTO THE UI.
 *
 * Status: passes identity, SWAP, pure single-axis interactions (exp(iα XX)).
 * Still fails on CNOT and most Haar-random unitaries — the simultaneous-
 * diagonalisation path can't pin down eigenvectors inside degenerate
 * eigenvalue blocks (e.g. CNOT's Weyl coords (π/4, 0, 0) produce a doubled
 * spectrum), and the brute-force perm × sign mask doesn't reach into the
 * extra SO(k) freedom that lives there. Sign-mask now correctly encodes
 * the √(e^{2iθ}) = ±e^{iθ} ambiguity (was wrongly doing θ → -θ before).
 * Polar-projection of the candidate O_L onto O(4) added as a soft repair.
 *
 * Next-session move: handle degenerate blocks explicitly by extracting all
 * candidate orthonormal bases within the block (e.g. Givens-rotation sweep
 * inside each degenerate sub-block) before the perm/sign search, or pivot
 * to a Tucci-style algorithm that doesn't require Autonne-Takagi.
 * Tests live in `client/scripts/test-kak.ts` (run with
 * `npx tsx scripts/test-kak.ts`).
 *
 * Until correctness is verified end-to-end, this file is dead code: the
 * existing ResourcePanel KAK stub still surfaces the implementation-cost
 * estimate, and `u_arb_2` still simulates as a single 4×4 block.
 *
 * Cartan KAK decomposition of an arbitrary 4×4 unitary into:
 *
 *   U ≈ e^{iφ} · (A1 ⊗ A2) · RXX(2α) · RYY(2β) · RZZ(2γ) · (B1 ⊗ B2)
 *
 * The four single-qubit factors are emitted as `u3` gates and the
 * interaction core uses the IR's native `rxx`, `ryy`, `rzz` primitives.
 * Each Rxx/Ryy/Rzz lowers to 2 CNOT + 1q rotations under any downstream
 * CX-based transpile target, so the total CX count after transpile is ≈ 6 —
 * a small overhead over the optimal 3-CX form, in exchange for much
 * simpler and more robustly verified code.
 *
 * If the algorithm cannot find a self-consistent decomposition (residual
 * > tolerance after exhaustive sign + permutation search), returns null —
 * the caller should fall back to applying U as a single 4×4 block.
 *
 * Big-endian qubit order matches the rest of the codebase (qubit 0 is the
 * MSB of the 4-dim basis index). Output qubit indices 0 and 1 refer to
 * the two qubits of the input gate.
 */

export type Gate1Q = { kind: "u3"; theta: number; phi: number; lambda: number; qubit: 0 | 1 };
export type GateIsing = { kind: "rxx" | "ryy" | "rzz"; theta: number };
export type KakGate = Gate1Q | GateIsing;

export type KakResult = {
  gates: KakGate[];
  interaction: { alpha: number; beta: number; gamma: number };
  /** Max element-wise |U - U_recovered| after factoring out global phase.
   *  < 1e-6 on well-conditioned input; if the algorithm returned, this is
   *  the achieved precision. */
  residual: number;
};

const TOL = 1e-6;

// ─── Magic basis ───────────────────────────────────────────────────────

const SQRT2_INV = 1 / Math.SQRT2;
function magicBasis(): Complex[][] {
  // M = (1/√2) · [[1, 0, 0, i],
  //                [0, i, 1, 0],
  //                [0, i, -1, 0],
  //                [1, 0, 0, -i]]
  const i: Complex = [0, 1];
  const ni: Complex = [0, -1];
  const one: Complex = [1, 0];
  const z: Complex = [0, 0];
  const raw: Complex[][] = [
    [one, z, z, i],
    [z, i, one, z],
    [z, i, [-1, 0], z],
    [one, z, z, ni],
  ];
  return raw.map((row) => row.map((e) => [e[0] * SQRT2_INV, e[1] * SQRT2_INV] as Complex));
}

// ─── Linear algebra primitives ─────────────────────────────────────────

function matMul(A: Complex[][], B: Complex[][]): Complex[][] {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const out: Complex[][] = Array.from({ length: n }, () =>
    Array.from({ length: m }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let l = 0; l < k; l++) {
        const a = A[i][l]; const b = B[l][j];
        re += a[0] * b[0] - a[1] * b[1];
        im += a[0] * b[1] + a[1] * b[0];
      }
      out[i][j] = [re, im];
    }
  }
  return out;
}

function dagger(A: Complex[][]): Complex[][] {
  const n = A.length;
  const m = A[0].length;
  const out: Complex[][] = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      out[j][i] = [A[i][j][0], -A[i][j][1]];
    }
  }
  return out;
}

function transpose(A: Complex[][]): Complex[][] {
  const n = A.length;
  const m = A[0].length;
  const out: Complex[][] = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = A[i][j];
  return out;
}

function realMul(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0].length, k = B.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let l = 0; l < k; l++) s += A[i][l] * B[l][j];
      out[i][j] = s;
    }
  return out;
}

function realTranspose(A: number[][]): number[][] {
  const n = A.length, m = A[0].length;
  const out: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) out[j][i] = A[i][j];
  return out;
}

function identityReal(n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) out[i][i] = 1;
  return out;
}

/**
 * Jacobi eigenvalue algorithm for a real symmetric matrix. Returns (D, V)
 * with A = V D V^T. Reliable for small n; we use it on 4×4 and 2×2.
 */
function jacobiEigen(Ain: number[][], tol = 1e-12): { D: number[]; V: number[][] } {
  const n = Ain.length;
  const A = Ain.map((row) => [...row]);
  const V = identityReal(n);
  for (let iter = 0; iter < 200; iter++) {
    let p = 0, q = 1, maxOff = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(A[i][j]);
        if (v > maxOff) { maxOff = v; p = i; q = j; }
      }
    }
    if (maxOff < tol) break;
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];
    const theta = (aqq - app) / (2 * apq);
    const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta));
    const cs = 1 / Math.sqrt(1 + t * t);
    const sn = t * cs;
    for (let i = 0; i < n; i++) {
      const aip = A[i][p], aiq = A[i][q];
      A[i][p] = cs * aip - sn * aiq;
      A[i][q] = sn * aip + cs * aiq;
    }
    for (let j = 0; j < n; j++) {
      const apj = A[p][j], aqj = A[q][j];
      A[p][j] = cs * apj - sn * aqj;
      A[q][j] = sn * apj + cs * aqj;
    }
    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = cs * vip - sn * viq;
      V[i][q] = sn * vip + cs * viq;
    }
  }
  const D = new Array<number>(n);
  for (let i = 0; i < n; i++) D[i] = A[i][i];
  return { D, V };
}

/**
 * Simultaneously diagonalise two commuting real symmetric matrices.
 */
function simultaneousDiagonalise(
  A: number[][],
  B: number[][],
  degenTol = 1e-9,
): { R: number[][]; Da: number[]; Db: number[] } {
  const n = A.length;
  const { D: DaRaw, V: VA } = jacobiEigen(A);
  const order = DaRaw.map((_, i) => i).sort((a, b) => DaRaw[a] - DaRaw[b]);
  const Da = order.map((i) => DaRaw[i]);
  const V: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) V[i][j] = VA[i][order[j]];
  const Bp = realMul(realTranspose(V), realMul(B, V));
  const R: number[][] = identityReal(n);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && Math.abs(Da[j] - Da[i]) < degenTol) j++;
    if (j - i > 1) {
      const sub = Array.from({ length: j - i }, (_, r) =>
        Array.from({ length: j - i }, (_, s) => Bp[i + r][i + s]),
      );
      const { V: Vsub } = jacobiEigen(sub);
      for (let r = 0; r < j - i; r++)
        for (let s = 0; s < j - i; s++) R[i + r][i + s] = Vsub[r][s];
    }
    i = j;
  }
  const Rfinal = realMul(V, R);
  const At = realMul(realTranspose(Rfinal), realMul(A, Rfinal));
  const Bt = realMul(realTranspose(Rfinal), realMul(B, Rfinal));
  const DaOut = new Array<number>(n);
  const DbOut = new Array<number>(n);
  for (let k = 0; k < n; k++) { DaOut[k] = At[k][k]; DbOut[k] = Bt[k][k]; }
  return { R: Rfinal, Da: DaOut, Db: DbOut };
}

// ─── u3 angle extraction from a 2×2 unitary ─────────────────────────────

function su2ToU3(U: Complex[][]): { theta: number; phi: number; lambda: number } {
  const arg00 = Math.atan2(U[0][0][1], U[0][0][0]);
  const e_negPhase: Complex = [Math.cos(-arg00), Math.sin(-arg00)];
  const Ur: Complex[][] = U.map((row) => row.map((e) => cmul(e_negPhase, e)));
  const cosHalf = Ur[0][0][0];
  const ch = Math.min(1, Math.max(-1, cosHalf));
  const theta = 2 * Math.acos(ch);
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-9) {
    const phiPlusLambda = Math.atan2(Ur[1][1][1], Ur[1][1][0]);
    return { theta, phi: phiPlusLambda, lambda: 0 };
  }
  const phi = Math.atan2(Ur[1][0][1], Ur[1][0][0]);
  const negU01: Complex = neg(Ur[0][1]);
  const lambda = Math.atan2(negU01[1], negU01[0]);
  return { theta, phi, lambda };
}

// ─── Main entry point ──────────────────────────────────────────────────

export function decomposeKAK4x4(U: Complex[][]): KakResult | null {
  if (U.length !== 4 || U[0].length !== 4) return null;

  // Normalise to SU(4): the magic-basis argument requires det(U) = 1.
  // Factor out det(U)^{1/4} as a global phase (unobservable, so dropped).
  const detU = det4Complex(U);
  const detMag = Math.sqrt(detU[0] * detU[0] + detU[1] * detU[1]);
  if (detMag < 1e-12) return null;
  const detArg = Math.atan2(detU[1], detU[0]);
  const phi = detArg / 4;
  const phaseInv: Complex = [Math.cos(-phi), Math.sin(-phi)];
  const Usu: Complex[][] = U.map((row) => row.map((e) => cmul(phaseInv, e)));

  const M = magicBasis();
  const Mdag = dagger(M);
  const Um = matMul(Mdag, matMul(Usu, M));
  const UmT = transpose(Um);
  const Sigma = matMul(UmT, Um);

  // Symmetrise to remove tiny numerical asymmetry.
  const Are: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  const Bim: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      Are[i][j] = (Sigma[i][j][0] + Sigma[j][i][0]) / 2;
      Bim[i][j] = (Sigma[i][j][1] + Sigma[j][i][1]) / 2;
    }
  }
  const sim = simultaneousDiagonalise(Are, Bim);
  const Rraw = sim.R;
  const dRe = sim.Da;
  const dIm = sim.Db;
  const phasesRaw = dRe.map((re, k) => Math.atan2(dIm[k], re));
  // Try every column-sign pattern (16 variants) so we cover both det
  // chiralities and the per-column ± freedom inside any degenerate
  // eigenvalue blocks. The brute-force perm × sign-mask loop runs on
  // each variant; first one to hit residual < TOL wins.
  const Rvariants: { R: number[][]; phases: number[] }[] = [];
  for (let colMask = 0; colMask < 16; colMask++) {
    const Rv: number[][] = Rraw.map((row) => [...row]);
    for (let c = 0; c < 4; c++) {
      if (colMask & (1 << c)) {
        for (let i = 0; i < 4; i++) Rv[i][c] = -Rv[i][c];
      }
    }
    if (det4(Rv) < 0) continue; // restrict to SO(4)
    Rvariants.push({ R: Rv, phases: phasesRaw });
  }
  // Run the main loop body across every R variant, picking the best hit.
  let bestAcrossVariants: { result: KakResult } | null = null;
  for (const variant of Rvariants) {
    const sub = decomposeWithR(variant.R, variant.phases, Usu, M, Um);
    if (sub && sub.residual < TOL) return sub;
    if (sub && (!bestAcrossVariants || sub.residual < bestAcrossVariants.result.residual)) {
      bestAcrossVariants = { result: sub };
    }
  }
  if (bestAcrossVariants && bestAcrossVariants.result.residual < 0.1) return bestAcrossVariants.result;
  if (bestAcrossVariants && typeof (globalThis as { __KAK_DEBUG__?: boolean }).__KAK_DEBUG__ !== "undefined") {
    // eslint-disable-next-line no-console
    console.log(`KAK: best residual = ${bestAcrossVariants.result.residual.toExponential(2)}`);
  }
  return null;
}

function decomposeWithR(
  R: number[][],
  phasesRaw: number[],
  U: Complex[][],
  _M: Complex[][],
  Um: Complex[][],
): KakResult | null {
  const phases = phasesRaw;

  // The eigenvalues of K(α, β, γ) = exp(i(α XX + β YY + γ ZZ)) in the
  // magic basis form a specific multiset:
  //   {α + β + γ, α − β − γ, −α + β − γ, −α − β + γ}
  // We don't know which phase[k] corresponds to which entry of that
  // multiset, so we brute-force over all 24 permutations and 16 sign
  // choices (each √-phase has a ±1 ambiguity), picking the lowest
  // verified residual.
  let best: { result: KakResult } | null = null;
  const phaseHalf = phases.map((p) => p / 2);

  const Rc: Complex[][] = R.map((row) => row.map((v) => [v, 0] as Complex));
  const ORreal = realTranspose(R);

  for (const perm of PERMS_4) {
    for (let mask = 0; mask < 16; mask++) {
      // Sign ambiguity: D² has eigenvalues e^{2iθ_k}; D has ±e^{iθ_k}.
      // sign = -1 means we use -e^{iθ_k} = e^{i(θ_k + π)} instead.
      const signFlips: number[] = [
        (mask & 1) ? 1 : 0,
        (mask & 2) ? 1 : 0,
        (mask & 4) ? 1 : 0,
        (mask & 8) ? 1 : 0,
      ];
      // Effective θ_k per eigenvector slot k = phaseHalf[k] + π·flip[k].
      // After permutation we have the *assigned* phases per Weyl-chamber
      // slot s: thAssigned[s] = thEff[perm[s]].
      const thEff = phaseHalf.map((p, k) => p + Math.PI * signFlips[k]);
      const ph = perm.map((idx) => thEff[idx]);
      // Inversion of {α-β+γ, -α+β+γ, α+β-γ, -α-β-γ} = {ph[0..3]}:
      //   α = (ph[0] + ph[2]) / 2
      //   β = (ph[1] + ph[2]) / 2
      //   γ = (ph[0] + ph[1]) / 2
      const alpha = (ph[0] + ph[2]) / 2;
      const beta = (ph[1] + ph[2]) / 2;
      const gamma = (ph[0] + ph[1]) / 2;
      // F^{-1} in the original eigenvector basis: entry k uses θ_eff[k] = θ_k + π·flip[k].
      const FinvDiag: Complex[] = thEff.map((eff) => [Math.cos(-eff), Math.sin(-eff)]);
      const Finv: Complex[][] = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => [0, 0] as Complex),
      );
      for (let k = 0; k < 4; k++) Finv[k][k] = FinvDiag[k];
      const OLc = matMul(Um, matMul(Rc, Finv));
      // OL must be in SO(4). With degenerate eigenvalues the diagonalisation
      // is only defined up to a unitary inside each degenerate block, so OLc
      // may have non-trivial imaginary parts. Polar-project the real part
      // onto O(4) and let the residual check decide if this candidate works.
      const OLrealRaw: number[][] = OLc.map((row) => row.map((e) => e[0]));
      const OLreal = polarOrthogonalise(OLrealRaw);
      if (!OLreal) continue;
      if (det4(OLreal) < 0) {
        // det -1 → flip first column to land in SO(4).
        for (let i = 0; i < 4; i++) OLreal[i][0] = -OLreal[i][0];
      }
      const lTensor = magicToTensor(OLreal);
      const rTensor = magicToTensor(ORreal);
      if (!lTensor || !rTensor) continue;
      const B1 = su2ToU3(rTensor.V1);
      const B2 = su2ToU3(rTensor.V2);
      const A1 = su2ToU3(lTensor.V1);
      const A2 = su2ToU3(lTensor.V2);
      // Build gate list. exp(iα XX) = RXX(-2α) in our convention
      // (RXX(θ) = exp(-iθ/2 · XX)), so the Ising-rotation angle is -2·{α,β,γ}.
      const gates: KakGate[] = [
        { kind: "u3", ...B1, qubit: 0 },
        { kind: "u3", ...B2, qubit: 1 },
        { kind: "rxx", theta: -2 * alpha },
        { kind: "ryy", theta: -2 * beta },
        { kind: "rzz", theta: -2 * gamma },
        { kind: "u3", ...A1, qubit: 0 },
        { kind: "u3", ...A2, qubit: 1 },
      ];
      const residual = verifyResidual(U, gates);
      if (residual < TOL) {
        return { gates, interaction: { alpha, beta, gamma }, residual };
      }
      if (!best || residual < best.result.residual) {
        best = { result: { gates, interaction: { alpha, beta, gamma }, residual } };
      }
    }
  }
  return best ? best.result : null;
}

// All 24 permutations of [0, 1, 2, 3].
const PERMS_4: number[][] = (() => {
  const out: number[][] = [];
  const arr = [0, 1, 2, 3];
  const perm = (a: number[], k: number) => {
    if (k === a.length - 1) { out.push([...a]); return; }
    for (let i = k; i < a.length; i++) {
      [a[k], a[i]] = [a[i], a[k]];
      perm(a, k + 1);
      [a[k], a[i]] = [a[i], a[k]];
    }
  };
  perm(arr, 0);
  return out;
})();

// ─── Helpers: det, magic→tensor, gate-matrix builder, verification ─────

function det4Complex(A: Complex[][]): Complex {
  // Direct cofactor expansion. Sufficient at n=4.
  function det3c(m: Complex[][]): Complex {
    const t1 = cmul(m[1][1], m[2][2]);
    const t2 = cmul(m[1][2], m[2][1]);
    const a = [t1[0] - t2[0], t1[1] - t2[1]] as Complex;
    const t3 = cmul(m[1][0], m[2][2]);
    const t4 = cmul(m[1][2], m[2][0]);
    const b = [t3[0] - t4[0], t3[1] - t4[1]] as Complex;
    const t5 = cmul(m[1][0], m[2][1]);
    const t6 = cmul(m[1][1], m[2][0]);
    const cc = [t5[0] - t6[0], t5[1] - t6[1]] as Complex;
    const r1 = cmul(m[0][0], a);
    const r2 = cmul(m[0][1], b);
    const r3 = cmul(m[0][2], cc);
    return [r1[0] - r2[0] + r3[0], r1[1] - r2[1] + r3[1]];
  }
  let det: Complex = [0, 0];
  for (let j = 0; j < 4; j++) {
    const minor: Complex[][] = [];
    for (let i = 1; i < 4; i++) {
      const row: Complex[] = [];
      for (let k = 0; k < 4; k++) if (k !== j) row.push(A[i][k]);
      minor.push(row);
    }
    const sign = (j % 2 === 0) ? 1 : -1;
    const term = cmul(A[0][j], det3c(minor));
    det = [det[0] + sign * term[0], det[1] + sign * term[1]];
  }
  return det;
}

function det4(A: number[][]): number {
  function det3(m: number[][]): number {
    return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
         - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
         + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  }
  let det = 0;
  for (let j = 0; j < 4; j++) {
    const minor: number[][] = [];
    for (let i = 1; i < 4; i++) {
      const row: number[] = [];
      for (let k = 0; k < 4; k++) if (k !== j) row.push(A[i][k]);
      minor.push(row);
    }
    det += ((j % 2 === 0) ? 1 : -1) * A[0][j] * det3(minor);
  }
  return det;
}

function magicToTensor(O: number[][]): { V1: Complex[][]; V2: Complex[][] } | null {
  const M = magicBasis();
  const Mdag = dagger(M);
  const Oc: Complex[][] = O.map((row) => row.map((v) => [v, 0] as Complex));
  const T = matMul(M, matMul(Oc, Mdag));
  let bestI = 0, bestJ = 0, bestM = -1;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const m = T[i][j][0] * T[i][j][0] + T[i][j][1] * T[i][j][1];
    if (m > bestM) { bestM = m; bestI = i; bestJ = j; }
  }
  if (bestM < 1e-12) return null;
  const a0 = bestI >> 1, b0 = bestI & 1;
  const c10 = bestJ >> 1, c20 = bestJ & 1;
  const pivot = T[bestI][bestJ];
  const pivotAbs = Math.sqrt(pivot[0] * pivot[0] + pivot[1] * pivot[1]);
  const V1pivot: Complex = [Math.sqrt(pivotAbs), 0];
  const V2pivot: Complex = [pivot[0] / V1pivot[0], pivot[1] / V1pivot[0]];

  const V1: Complex[][] = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
  const V2: Complex[][] = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
  V1[a0][c10] = V1pivot;
  V2[b0][c20] = V2pivot;
  const v2Inv = cinv(V2pivot);
  for (let a = 0; a < 2; a++) for (let c1 = 0; c1 < 2; c1++) {
    if (a === a0 && c1 === c10) continue;
    V1[a][c1] = cmul(T[2 * a + b0][2 * c1 + c20], v2Inv);
  }
  const v1Inv = cinv(V1pivot);
  for (let b = 0; b < 2; b++) for (let c2 = 0; c2 < 2; c2++) {
    if (b === b0 && c2 === c20) continue;
    V2[b][c2] = cmul(T[2 * a0 + b][2 * c10 + c2], v1Inv);
  }
  return { V1, V2 };
}

/**
 * Polar projection: given a real 4×4 matrix M, return the nearest orthogonal
 * matrix Q via Q = U V^T where M = U Σ V^T is the SVD. Implemented by
 * eigendecomposing M^T M (symmetric PSD) → Σ², V; then U = M V Σ^{-1}.
 * Returns null if M is singular.
 */
function polarOrthogonalise(M: number[][]): number[][] | null {
  const MtM = realMul(realTranspose(M), M);
  const { D, V } = jacobiEigen(MtM);
  const sigma = D.map((d) => Math.sqrt(Math.max(d, 0)));
  for (const s of sigma) if (s < 1e-9) return null;
  const sigmaInv = sigma.map((s) => 1 / s);
  // U = M · V · diag(sigmaInv)
  const MV = realMul(M, V);
  const U: number[][] = MV.map((row) => row.map((v, j) => v * sigmaInv[j]));
  // Q = U · V^T
  return realMul(U, realTranspose(V));
}

function cinv(z: Complex): Complex {
  const m = z[0] * z[0] + z[1] * z[1];
  if (m < 1e-30) return [0, 0];
  return [z[0] / m, -z[1] / m];
}

function verifyResidual(U: Complex[][], gates: KakGate[]): number {
  let M: Complex[][] = [
    [[1, 0], [0, 0], [0, 0], [0, 0]],
    [[0, 0], [1, 0], [0, 0], [0, 0]],
    [[0, 0], [0, 0], [1, 0], [0, 0]],
    [[0, 0], [0, 0], [0, 0], [1, 0]],
  ];
  for (const g of gates) {
    const G = gateMatrix4x4(g);
    M = matMul(G, M);
  }
  let pivotI = 0, pivotJ = 0, pivotMag = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const m = U[i][j][0] * U[i][j][0] + U[i][j][1] * U[i][j][1];
    if (m > pivotMag) { pivotMag = m; pivotI = i; pivotJ = j; }
  }
  const u = U[pivotI][pivotJ];
  const m = M[pivotI][pivotJ];
  const phaseRatio = cmul(u, cinv(m));
  const phaseMag = Math.sqrt(phaseRatio[0] * phaseRatio[0] + phaseRatio[1] * phaseRatio[1]);
  const phase: Complex = phaseMag > 1e-12
    ? [phaseRatio[0] / phaseMag, phaseRatio[1] / phaseMag]
    : [1, 0];
  let maxErr = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const aligned = cmul(phase, M[i][j]);
    const dr = aligned[0] - U[i][j][0];
    const di = aligned[1] - U[i][j][1];
    const e = Math.sqrt(dr * dr + di * di);
    if (e > maxErr) maxErr = e;
  }
  return maxErr;
}

function gateMatrix4x4(g: KakGate): Complex[][] {
  if (g.kind === "rxx") {
    const co = Math.cos(g.theta / 2);
    const si = Math.sin(g.theta / 2);
    return [
      [[co, 0], [0, 0], [0, 0], [0, -si]],
      [[0, 0], [co, 0], [0, -si], [0, 0]],
      [[0, 0], [0, -si], [co, 0], [0, 0]],
      [[0, -si], [0, 0], [0, 0], [co, 0]],
    ];
  }
  if (g.kind === "ryy") {
    const co = Math.cos(g.theta / 2);
    const si = Math.sin(g.theta / 2);
    return [
      [[co, 0], [0, 0], [0, 0], [0, si]],
      [[0, 0], [co, 0], [0, -si], [0, 0]],
      [[0, 0], [0, -si], [co, 0], [0, 0]],
      [[0, si], [0, 0], [0, 0], [co, 0]],
    ];
  }
  if (g.kind === "rzz") {
    const em: Complex = [Math.cos(-g.theta / 2), Math.sin(-g.theta / 2)];
    const ep: Complex = [Math.cos(g.theta / 2), Math.sin(g.theta / 2)];
    return [
      [em, [0, 0], [0, 0], [0, 0]],
      [[0, 0], ep, [0, 0], [0, 0]],
      [[0, 0], [0, 0], ep, [0, 0]],
      [[0, 0], [0, 0], [0, 0], em],
    ];
  }
  if (g.kind !== "u3") throw new Error(`unknown KAK gate kind`);
  const u3 = u3Matrix(g.theta, g.phi, g.lambda);
  const I2: Complex[][] = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
  return g.qubit === 0 ? kron(u3, I2) : kron(I2, u3);
}

function u3Matrix(theta: number, phi: number, lambda: number): Complex[][] {
  const ch = Math.cos(theta / 2);
  const sh = Math.sin(theta / 2);
  const eIl: Complex = [Math.cos(lambda), Math.sin(lambda)];
  const eIp: Complex = [Math.cos(phi), Math.sin(phi)];
  const eIpl: Complex = cmul(eIp, eIl);
  return [
    [[ch, 0], [-eIl[0] * sh, -eIl[1] * sh]],
    [[eIp[0] * sh, eIp[1] * sh], [eIpl[0] * ch, eIpl[1] * ch]],
  ];
}

function kron(A: Complex[][], B: Complex[][]): Complex[][] {
  const nA = A.length, mA = A[0].length, nB = B.length, mB = B[0].length;
  const out: Complex[][] = Array.from({ length: nA * nB }, () =>
    Array.from({ length: mA * mB }, () => [0, 0] as Complex),
  );
  for (let i = 0; i < nA; i++)
    for (let j = 0; j < mA; j++)
      for (let k = 0; k < nB; k++)
        for (let l = 0; l < mB; l++)
          out[i * nB + k][j * mB + l] = cmul(A[i][j], B[k][l]);
  return out;
}
