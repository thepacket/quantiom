import { describe, test, expect } from "vitest";
import { decoherenceByDepth, MAX_DECOHERENCE_QUBITS } from "../src/sim/decoherence";
import { simulate } from "../src/sim/simulate";
import { DEFAULT_NOISE, type NoiseModel } from "../src/sim/noise";
import { circ, gate } from "./helpers";

const noiseless = (over: Partial<NoiseModel> = {}): NoiseModel => ({
  ...DEFAULT_NOISE, enabled: true, trajectories: 1,
  oneQubitDepolarising: 0, twoQubitDepolarising: 0, amplitudeDamping: 0,
  phaseDamping: 0, readoutBitFlip: 0, crosstalk: 0, ...over,
});

// h(0) @col0, cx @col1, t @col2 → 3 columns of depth.
const ghz = circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("t", [0], [], [], 2)]);

describe("decoherenceByDepth", () => {
  test("one distribution per circuit column, each a normalised histogram", () => {
    const r = decoherenceByDepth(ghz, {}, [], noiseless())!;
    expect(r.numQubits).toBe(2);
    expect(r.columns).toEqual([0, 1, 2]);
    expect(r.dists).toHaveLength(3);
    for (const d of r.dists) {
      expect(d).toHaveLength(4); // 2² basis states
      expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });

  test("zero noise ⇒ each frame equals the exact prefix distribution", () => {
    const r = decoherenceByDepth(ghz, {}, [], noiseless())!;
    for (let k = 0; k < r.dists.length; k++) {
      const prefix = { ...ghz, gates: ghz.gates.filter((g) => g.column <= k) };
      const exact = simulate(prefix, {}, []).probabilities;
      for (let i = 0; i < exact.length; i++) {
        expect(r.dists[k][i]).toBeCloseTo(exact[i], 9);
      }
    }
  });

  test("first frame (just H) is a 50/50 split on qubit 0", () => {
    const r = decoherenceByDepth(ghz, {}, [], noiseless())!;
    // After column 0 (H on q0): |00⟩ and |10⟩ each ½ (big-endian: q0 is MSB).
    expect(r.dists[0][0b00]).toBeCloseTo(0.5, 9);
    expect(r.dists[0][0b10]).toBeCloseTo(0.5, 9);
    // After column 1 (CX): Bell — |00⟩ and |11⟩ each ½.
    expect(r.dists[1][0b00]).toBeCloseTo(0.5, 9);
    expect(r.dists[1][0b11]).toBeCloseTo(0.5, 9);
  });

  test("strong depolarising noise flattens the deepest frame toward uniform", () => {
    // Average several runs so the trajectory estimate is stable, then check the
    // deep, heavily-noised distribution is closer to uniform than the ideal.
    const noisy = noiseless({ oneQubitDepolarising: 0.2, twoQubitDepolarising: 0.2, trajectories: 400 });
    const dev = (d: number[]) => d.reduce((a, p) => a + Math.abs(p - 0.25), 0); // L1 distance to uniform
    let noisyDev = 0;
    const runs = 6;
    for (let i = 0; i < runs; i++) {
      const r = decoherenceByDepth(ghz, {}, [], noisy)!;
      noisyDev += dev(r.dists[r.dists.length - 1]);
    }
    noisyDev /= runs;
    const idealDev = dev([0.5, 0, 0, 0.5]); // Bell-ish deep ideal is far from uniform (=1)
    expect(noisyDev).toBeLessThan(idealDev);
  });

  test("returns null past the qubit cap", () => {
    const big = circ(MAX_DECOHERENCE_QUBITS + 1, [gate("h", [0])]);
    expect(decoherenceByDepth(big, {}, [], noiseless())).toBeNull();
  });

  test("a gate-less circuit still yields one (pristine) frame", () => {
    const r = decoherenceByDepth(circ(1, []), {}, [], noiseless())!;
    expect(r.dists).toHaveLength(1);
    expect(r.dists[0][0]).toBeCloseTo(1, 9); // |0⟩
  });
});
