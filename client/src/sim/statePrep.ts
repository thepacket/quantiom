/**
 * State-preparation synthesis: given a target statevector, build a circuit of
 * RY / RZ / CX gates that prepares it from |0…0⟩.
 *
 * Method (Möttönen–Vartiainen–Bergholm–Salomaa 2005): split the target into
 * magnitudes and phases.
 *   • Magnitudes — a cascade of uniformly-controlled RY rotations, one per
 *     qubit, with angles from a binary "norm tree" of the amplitude moduli.
 *   • Phases — a cascade of uniformly-controlled RZ rotations realising the
 *     diagonal phase unitary diag(e^{iφ_i}) (exact up to a global phase, which
 *     is unobservable for state preparation).
 * Each uniformly-controlled rotation decomposes recursively into RY/RZ + CX.
 *
 * Big-endian: qubit 0 is the MSB of the amplitude index. The synthesized
 * circuit reproduces the target up to global phase (verified at machine
 * precision by simulating it back — see the tests).
 */

import { evalExpr } from "./expr";
import type { Circuit, PlacedGate, GateId } from "../editor/types";

const MAX_QUBITS = 8;

let _sid = 0;
function g(gateId: GateId, targets: number[], controls: number[], params: string[]): PlacedGate {
  return { id: `sp${_sid++}`, gateId, column: 0, controls, targets, clbits: [], params };
}

/** Uniformly-controlled rotation (axis y/z) on `target`, controlled by
 *  `ctrls` (ctrls[0] = most-significant control). `theta` has length 2^k
 *  indexed with ctrls[0] as the MSB. Recursive average/difference identity:
 *  UC_k[θ] = UC_{k-1}[a] · CX(top,t) · UC_{k-1}[b] · CX(top,t), with
 *  a_j = (θ_j+θ_{j+h})/2, b_j = (θ_j−θ_{j+h})/2. */
function ucRot(axis: "ry" | "rz", ctrls: number[], target: number, theta: number[]): PlacedGate[] {
  if (ctrls.length === 0) return [g(axis, [target], [], [String(theta[0])])];
  const top = ctrls[0];
  const rest = ctrls.slice(1);
  const h = theta.length / 2;
  const a = new Array<number>(h);
  const b = new Array<number>(h);
  for (let j = 0; j < h; j++) {
    a[j] = (theta[j] + theta[j + h]) / 2;
    b[j] = (theta[j] - theta[j + h]) / 2;
  }
  return [
    ...ucRot(axis, rest, target, a),
    g("cx", [target], [top], []),
    ...ucRot(axis, rest, target, b),
    g("cx", [target], [top], []),
  ];
}

export type StatePrepResult = {
  gates: PlacedGate[];
  /** Global phase (radians) dropped during synthesis; informational only. */
  globalPhase: number;
};

/**
 * Synthesize a circuit preparing `target` (interleaved re/im OR {re,im}[] —
 * here re[]/im[] parallel arrays of length 2^n) from |0…0⟩.
 * Returns null on bad input (wrong length, zero vector, too many qubits).
 */
export function synthesizeStatePrep(re: number[], im: number[], n: number): StatePrepResult | null {
  if (n < 1 || n > MAX_QUBITS) return null;
  const dim = 1 << n;
  if (re.length !== dim || im.length !== dim) return null;

  // Normalise.
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += re[i] * re[i] + im[i] * im[i];
  if (norm < 1e-15) return null;
  norm = Math.sqrt(norm);
  const m = new Array<number>(dim);
  const phi = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const r = re[i] / norm;
    const ii = im[i] / norm;
    m[i] = Math.hypot(r, ii);
    phi[i] = Math.atan2(ii, r);
  }

  const gates: PlacedGate[] = [];

  // ── magnitudes: uniformly-controlled RY per qubit ────────────────
  for (let d = 0; d < n; d++) {
    const nCfg = 1 << d; // prefixes over qubits 0..d-1
    const theta = new Array<number>(nCfg);
    for (let p = 0; p < nCfg; p++) {
      let l2 = 0, r2 = 0;
      // amplitudes whose top d bits == p; split on qubit d.
      const lowBits = n - 1 - d; // bit position of qubit d
      for (let lo = 0; lo < 1 << (n - d); lo++) {
        // reconstruct index: top d bits = p, remaining (n-d) bits = lo
        const idx = (p << (n - d)) | lo;
        const bitD = (idx >> lowBits) & 1;
        if (bitD === 0) l2 += m[idx] * m[idx];
        else r2 += m[idx] * m[idx];
      }
      theta[p] = 2 * Math.atan2(Math.sqrt(r2), Math.sqrt(l2));
    }
    const ctrls = Array.from({ length: d }, (_, k) => k); // qubits 0..d-1, MSB first
    gates.push(...ucRot("ry", ctrls, d, theta));
  }

  // ── phases: uniformly-controlled RZ per qubit ────────────────────
  for (let d = 0; d < n; d++) {
    const nCfg = 1 << d;
    const delta = new Array<number>(nCfg);
    for (let p = 0; p < nCfg; p++) {
      let lSum = 0, lCnt = 0, rSum = 0, rCnt = 0;
      const lowBits = n - 1 - d;
      for (let lo = 0; lo < 1 << (n - d); lo++) {
        const idx = (p << (n - d)) | lo;
        if ((idx >> lowBits) & 1) { rSum += phi[idx]; rCnt++; }
        else { lSum += phi[idx]; lCnt++; }
      }
      const lMean = lCnt ? lSum / lCnt : 0;
      const rMean = rCnt ? rSum / rCnt : 0;
      delta[p] = rMean - lMean;
    }
    const ctrls = Array.from({ length: d }, (_, k) => k);
    gates.push(...ucRot("rz", ctrls, d, delta));
  }

  // Re-pack columns sequentially.
  gates.forEach((gt, i) => (gt.column = i));
  const globalPhase = phi.reduce((s, v) => s + v, 0) / dim;
  return { gates, globalPhase };
}

/** Build a full Circuit (n qubits) preparing the target. */
export function statePrepCircuit(re: number[], im: number[], n: number, name?: string): Circuit | null {
  const r = synthesizeStatePrep(re, im, n);
  if (!r) return null;
  return { numQubits: n, numClbits: 0, gates: r.gates, name: name ?? "state preparation" };
}

/** Parse a target spec string into re/im arrays. Accepts a comma/space/newline
 *  -separated list of `a` or `a+bi` complex literals (length must be 2^n), or
 *  a basis-state label like `|011⟩` / `011`. Returns null on failure. */
export function parseTargetState(text: string, n: number): { re: number[]; im: number[] } | null {
  const dim = 1 << n;
  const t = text.trim();
  if (!t) return null;
  // Basis label: 0/1 string of length n (optionally wrapped in |…⟩).
  const label = t.replace(/[|⟩〉>]/g, "").trim();
  if (/^[01]+$/.test(label) && label.length === n) {
    const re = new Array<number>(dim).fill(0);
    const im = new Array<number>(dim).fill(0);
    re[parseInt(label, 2)] = 1;
    return { re, im };
  }
  // Amplitude list.
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  if (tokens.length !== dim) return null;
  const re = new Array<number>(dim).fill(0);
  const im = new Array<number>(dim).fill(0);
  for (let i = 0; i < dim; i++) {
    const parsed = parseComplex(tokens[i]);
    if (!parsed) return null;
    re[i] = parsed[0];
    im[i] = parsed[1];
  }
  return { re, im };
}

/** Parse one complex literal: "0.5", "1/sqrt(2)", "0.3+0.4i", "-i", "2i". */
function parseComplex(tok: string): [number, number] | null {
  const s = tok.replace(/\s+/g, "");
  // Split into real and imaginary parts on a +/- that isn't at position 0
  // and isn't part of an exponent. Imaginary part ends with i/j.
  const mImag = s.match(/([+-]?[^+-]*[ij])$/);
  let imStr = "";
  let reStr = s;
  if (mImag) {
    imStr = mImag[1];
    reStr = s.slice(0, s.length - imStr.length);
  }
  const re = reStr ? evalExpr(reStr, {}) : 0;
  let im = 0;
  if (imStr) {
    const body = imStr.replace(/[ij]$/, "");
    im = body === "" || body === "+" ? 1 : body === "-" ? -1 : evalExpr(body, {});
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
  return [re, im];
}
