import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { participation, participationSweep } from "../src/sim/participation";
import { circ, gate } from "./helpers";

const partOf = (n: number, gates: ReturnType<typeof gate>[]) => {
  const res = simulate(circ(n, gates), {}, []);
  return participation(res.probabilities, n);
};

describe("participation", () => {
  test("basis state |0…0⟩ is fully localized (PR = 1, IPR = 1)", () => {
    const r = partOf(3, []);
    expect(r.ipr).toBeCloseTo(1, 9);
    expect(r.participationRatio).toBeCloseTo(1, 9);
    expect(r.shannon).toBeCloseTo(0, 9);
    expect(r.renyi2).toBeCloseTo(0, 9);
    expect(r.dim).toBe(8);
  });

  test("uniform |+⟩^⊗n is fully delocalized (PR = D, IPR = 1/D)", () => {
    for (const n of [1, 2, 3, 4]) {
      const D = 1 << n;
      const gs = Array.from({ length: n }, (_, q) => gate("h", [q]));
      const r = partOf(n, gs);
      expect(r.ipr).toBeCloseTo(1 / D, 6);
      expect(r.participationRatio).toBeCloseTo(D, 5);
      expect(r.shannon).toBeCloseTo(Math.log(D), 6); // ln D nats
      expect(r.renyi2).toBeCloseTo(Math.log(D), 6);
      expect(r.fraction).toBeCloseTo(1, 6);
    }
  });

  test("Bell state occupies 2 basis states equally → PR = 2", () => {
    const r = partOf(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
    expect(r.participationRatio).toBeCloseTo(2, 6);
    expect(r.ipr).toBeCloseTo(0.5, 6);
    expect(r.renyi2).toBeCloseTo(Math.log(2), 6);
  });

  test("a single H gives PR = 2 (two equal amplitudes)", () => {
    const r = partOf(1, [gate("h", [0])]);
    expect(r.participationRatio).toBeCloseTo(2, 6);
  });

  test("IPR is clamped to [1/D, 1]", () => {
    const r = participation([0.5, 0.5, 0, 0], 2);
    expect(r.ipr).toBeGreaterThanOrEqual(0.25);
    expect(r.ipr).toBeLessThanOrEqual(1);
    expect(r.participationRatio).toBeCloseTo(2, 9);
  });

  test("works on a raw probability array (mixed diagonal)", () => {
    const r = participation([0.25, 0.25, 0.25, 0.25], 2);
    expect(r.participationRatio).toBeCloseTo(4, 9);
  });
});

describe("participationSweep", () => {
  test("PR grows column-by-column as H gates spread the weight", () => {
    // Column 0: H on q0 → PR 2; column 1: H on q1 → PR 4; column 2: H on q2 → PR 8.
    const s = participationSweep(
      circ(3, [gate("h", [0], [], [], 0), gate("h", [1], [], [], 1), gate("h", [2], [], [], 2)]),
      {}, [],
    )!;
    expect(s.numCols).toBe(3);
    expect(s.dim).toBe(8);
    expect(s.pr[0]).toBeCloseTo(2, 5);
    expect(s.pr[1]).toBeCloseTo(4, 5);
    expect(s.pr[2]).toBeCloseTo(8, 5);
  });

  test("returns null when there are no columns", () => {
    expect(participationSweep(circ(2, []), {}, [])).toBeNull();
  });
});
