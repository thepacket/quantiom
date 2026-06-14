import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { pageCurve, pageEntropyBits } from "../src/sim/pageCurve";
import { tripartiteInformation } from "../src/sim/tripartiteInfo";
import { entanglementHamiltonian } from "../src/sim/entanglementHamiltonian";
import { countingStatistics } from "../src/sim/countingStatistics";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

/** Bell state (|00⟩+|11⟩)/√2. */
function bell() {
  return simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
}
/** n-qubit GHZ via H + CX chain. */
function ghz(n: number) {
  const gates = [gate("h", [0])];
  for (let q = 1; q < n; q++) gates.push(gate("cx", [q], [q - 1]));
  return simulate(circ(n, gates), {}).state;
}

describe("pageCurve", () => {
  test("pageEntropyBits(1,1) matches the analytic Page value and is < 1", () => {
    // S_page (nats) = (1/3 + 1/4) − 1/4 = 1/3; in bits = (1/3)/ln2 ≈ 0.4809.
    expect(close(pageEntropyBits(1, 1), (1 / 3) / Math.LN2, 1e-9)).toBe(true);
    expect(pageEntropyBits(1, 1)).toBeLessThan(1);
  });

  test("Bell cut entropy is 1 bit, page value below it", () => {
    const r = pageCurve(bell(), 2)!;
    expect(close(r.entropy[0], 1)).toBe(true);
    expect(close(r.maxEntropy[0], 1)).toBe(true);
    expect(r.page[0]).toBeLessThan(1);
  });

  test("product state is flat at zero", () => {
    const r = pageCurve(simulate(circ(3, [gate("x", [1])]), {}).state, 3)!;
    for (const s of r.entropy) expect(close(s, 0)).toBe(true);
  });
});

describe("tripartiteInformation", () => {
  test("GHZ-4 gives I₃ = +1 (not scrambling)", () => {
    const r = tripartiteInformation(ghz(4), 4, 0, 1, 2)!;
    expect(close(r.i3, 1, 1e-5)).toBe(true);
    expect(close(r.iAB, 1, 1e-5)).toBe(true);
  });

  test("product state gives I₃ = 0", () => {
    const r = tripartiteInformation(simulate(circ(4, [gate("x", [0])]), {}).state, 4, 0, 1, 2)!;
    expect(close(r.i3, 0)).toBe(true);
  });

  test("rejects non-distinct qubits and small registers", () => {
    expect(tripartiteInformation(ghz(4), 4, 0, 0, 1)).toBeNull();
    expect(tripartiteInformation(bell(), 2, 0, 1, 1)).toBeNull();
  });
});

describe("entanglementHamiltonian", () => {
  test("Bell cut: two levels at ξ = ln 2", () => {
    const r = entanglementHamiltonian(bell(), 2, [0])!;
    expect(r.levels.length).toBe(2);
    for (const x of r.levels) expect(close(x, Math.LN2, 1e-6)).toBe(true);
    expect(close(r.entropy, 1)).toBe(true);
  });

  test("product cut has no spectrum (single weight)", () => {
    const r = entanglementHamiltonian(simulate(circ(2, [gate("x", [1])]), {}).state, 2, [0])!;
    // λ = {1,0} → only ξ = −ln1 = 0 survives.
    expect(r.levels.length).toBe(1);
    expect(close(r.levels[0], 0)).toBe(true);
  });
});

describe("countingStatistics", () => {
  test("Bell over both qubits: P(0)=P(2)=½, mean 1, var 1", () => {
    const r = countingStatistics(bell(), 2, [0, 1])!;
    expect(close(r.p[0], 0.5)).toBe(true);
    expect(close(r.p[1], 0)).toBe(true);
    expect(close(r.p[2], 0.5)).toBe(true);
    expect(close(r.mean, 1)).toBe(true);
    expect(close(r.variance, 1)).toBe(true);
  });

  test("Bell over one qubit: mean ½, var ¼", () => {
    const r = countingStatistics(bell(), 2, [0])!;
    expect(close(r.mean, 0.5)).toBe(true);
    expect(close(r.variance, 0.25)).toBe(true);
  });

  test("distribution sums to 1", () => {
    const r = countingStatistics(ghz(4), 4, [0, 1, 2])!;
    const sum = r.p.reduce((a, b) => a + b, 0);
    expect(close(sum, 1)).toBe(true);
  });
});
