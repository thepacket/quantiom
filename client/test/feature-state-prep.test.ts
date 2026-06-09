import { describe, it, expect } from "vitest";
import { synthesizeStatePrep, parseTargetState } from "../src/sim/statePrep";
import { simulate } from "../src/sim/simulate";
import { mulberry32 } from "../src/sim/measure";

/** |⟨target|prepared⟩|² — fidelity up to global phase. */
function fidelity(re: number[], im: number[], n: number): number {
  const r = synthesizeStatePrep(re, im, n);
  if (!r) throw new Error("synthesis returned null");
  const circ = { numQubits: n, numClbits: 0, gates: r.gates };
  const st = simulate(circ, {}, []).state;
  // normalise target
  let norm = 0;
  for (let i = 0; i < re.length; i++) norm += re[i] * re[i] + im[i] * im[i];
  norm = Math.sqrt(norm);
  let ipRe = 0, ipIm = 0;
  for (let i = 0; i < re.length; i++) {
    const tr = re[i] / norm, ti = im[i] / norm; // target
    const sr = st[2 * i], si = st[2 * i + 1]; // prepared
    // ⟨target|prepared⟩ = Σ conj(t) · s
    ipRe += tr * sr + ti * si;
    ipIm += tr * si - ti * sr;
  }
  return ipRe * ipRe + ipIm * ipIm;
}

describe("state-preparation synthesis", () => {
  it("prepares a few hand states at fidelity 1", () => {
    expect(fidelity([0, 1], [0, 0], 1)).toBeCloseTo(1, 10); // |1⟩
    expect(fidelity([1, 1], [0, 0], 1)).toBeCloseTo(1, 10); // |+⟩
    expect(fidelity([1, 0], [0, 1], 1)).toBeCloseTo(1, 10); // (|0⟩+i|1⟩)/√2
    // Bell (|00⟩+|11⟩)/√2
    expect(fidelity([1, 0, 0, 1], [0, 0, 0, 0], 2)).toBeCloseTo(1, 10);
    // a phased 2-qubit state
    expect(fidelity([0.5, 0.5, 0.5, 0.5], [0, 0.3, -0.2, 0.1], 2)).toBeCloseTo(1, 8);
  });

  it("prepares random states up to 4 qubits at fidelity ≈ 1", () => {
    const rng = mulberry32(20260609);
    for (const n of [1, 2, 3, 4]) {
      const dim = 1 << n;
      const re = Array.from({ length: dim }, () => rng() * 2 - 1);
      const im = Array.from({ length: dim }, () => rng() * 2 - 1);
      expect(fidelity(re, im, n)).toBeGreaterThan(1 - 1e-8);
    }
  });

  it("parses basis-label and amplitude-list targets", () => {
    const b = parseTargetState("011", 3);
    expect(b).not.toBeNull();
    expect(b!.re[3]).toBe(1); // |011⟩ = index 3
    const amp = parseTargetState("1, 0, 0, 1", 2);
    expect(amp!.re).toEqual([1, 0, 0, 1]);
    const cplx = parseTargetState("1, i, -i, 0.5+0.5i", 2);
    expect(cplx!.im[1]).toBeCloseTo(1, 10);
    expect(cplx!.im[2]).toBeCloseTo(-1, 10);
    expect(cplx!.re[3]).toBeCloseTo(0.5, 10);
    expect(parseTargetState("1,0,0", 2)).toBeNull(); // wrong length
  });
});
