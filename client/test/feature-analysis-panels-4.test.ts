import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { chshMap } from "../src/sim/chsh";
import { negativityDynamics } from "../src/sim/negativityDynamics";
import { entanglementSpectrumStats } from "../src/sim/entanglementSpectrumStats";
import { multifractal } from "../src/sim/multifractal";
import { ethOffDiagonal } from "../src/sim/ethOffDiagonal";
import { floquetSpectrum } from "../src/sim/floquetSpectrum";
import { otocLightcone } from "../src/sim/otocLightcone";
import { quantumDiscordMap } from "../src/sim/quantumDiscord";
import { parsePauliSum } from "../src/sim/trotter";

const close = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps;

function bell() {
  return simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
}

describe("chshMap", () => {
  test("Bell pair reaches the Tsirelson bound 2√2", () => {
    const r = chshMap(bell(), 2)!;
    expect(close(r.s[0][1], 2 * Math.SQRT2, 1e-4)).toBe(true);
    expect(r.max).toBeGreaterThan(2);
  });

  test("product state is local (S = 0 here, ≤ 2)", () => {
    const r = chshMap(simulate(circ(2, [gate("h", [0])]), {}).state, 2)!;
    expect(r.max).toBeLessThanOrEqual(2 + 1e-9);
  });
});

describe("negativityDynamics", () => {
  test("static Bell: E_N ≡ 1 across the cut", () => {
    const r = negativityDynamics(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}, [], [0], 16)!;
    for (const v of r.logNeg) expect(close(v, 1, 1e-6)).toBe(true);
  });

  test("product circuit: E_N ≡ 0", () => {
    const r = negativityDynamics(circ(2, [gate("h", [0])]), {}, [], [0], 16)!;
    for (const v of r.logNeg) expect(close(v, 0, 1e-9)).toBe(true);
  });
});

describe("entanglementSpectrumStats", () => {
  test("returns gap ratios in [0,1] with a mean in range", () => {
    // A 6-qubit entangling circuit gives a non-trivial entanglement spectrum.
    const gates = [gate("h", [0])];
    for (let q = 1; q < 6; q++) gates.push(gate("cx", [q], [q - 1]));
    for (let q = 0; q < 6; q++) gates.push(gate("t", [q]));
    const r = entanglementSpectrumStats(simulate(circ(6, gates), {}).state, 6, [0, 1, 2]);
    if (r) {
      for (const x of r.ratios) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); }
      expect(r.meanR).toBeGreaterThanOrEqual(0);
      expect(r.meanR).toBeLessThanOrEqual(1);
    }
  });
});

describe("multifractal", () => {
  test("uniform superposition is fully delocalised (D_q ≈ 1)", () => {
    const r = multifractal(simulate(circ(4, [gate("h", [0]), gate("h", [1]), gate("h", [2]), gate("h", [3])]), {}).state, 4)!;
    for (const d of r.dq) expect(close(d, 1, 1e-6)).toBe(true);
    expect(close(r.d2, 1, 1e-6)).toBe(true);
  });

  test("computational basis state is localised (D_q ≈ 0)", () => {
    const r = multifractal(simulate(circ(4, []), {}).state, 4)!;
    expect(close(r.d2, 0, 1e-9)).toBe(true);
    expect(close(r.dInf, 0, 1e-9)).toBe(true);
  });
});

describe("ethOffDiagonal", () => {
  test("returns off-diagonal + diagonal element sets", () => {
    const h = parsePauliSum("-1*ZZ - 0.7*XI - 0.7*IX");
    const o = parsePauliSum("1*ZI");
    const r = ethOffDiagonal(h, o, 2)!;
    expect(r.offDiag.length).toBeGreaterThan(0);
    expect(r.diag.length).toBe(4);
    expect(r.meanOffDiag).toBeGreaterThanOrEqual(0);
  });
});

describe("floquetSpectrum", () => {
  test("quasi-energies are valid phases and match the qubit count", () => {
    const c = circ(2, [gate("h", [0]), gate("cx", [1], [0]), gate("t", [1])]);
    const r = floquetSpectrum(c, {}, [])!;
    expect(r.quasiEnergies.length).toBe(4);
    for (const th of r.quasiEnergies) { expect(th).toBeGreaterThanOrEqual(-Math.PI - 1e-9); expect(th).toBeLessThanOrEqual(Math.PI + 1e-9); }
  });

  test("identity circuit: all quasi-energies ≈ 0 (U = I)", () => {
    const r = floquetSpectrum(circ(2, []), {}, [])!;
    for (const th of r.quasiEnergies) expect(close(th, 0, 1e-6)).toBe(true);
  });

  test("a Z gate gives quasi-energies {0, π} (eigenphases of Z)", () => {
    const r = floquetSpectrum(circ(1, [gate("z", [0])]), {}, [])!;
    const sorted = [...r.quasiEnergies].map((t) => Math.abs(t)).sort((a, b) => a - b);
    expect(close(sorted[0], 0, 1e-6)).toBe(true);
    expect(close(sorted[1], Math.PI, 1e-6)).toBe(true);
  });
});

describe("otocLightcone", () => {
  test("grid has one row per qubit and the W row is ~0", () => {
    const c = circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]);
    const r = otocLightcone(c, {}, [], 0, "Z", "Z", 12, 5)!;
    expect(r.grid.length).toBe(3);
    for (const v of r.grid[0]) expect(close(v, 0, 1e-9)).toBe(true); // W qubit self row
  });
});

describe("quantumDiscordMap", () => {
  test("Bell pair has discord ≈ 1 bit", () => {
    const r = quantumDiscordMap(bell(), 2)!;
    expect(close(r.d[0][1], 1, 0.02)).toBe(true);
  });

  test("product state has zero discord", () => {
    const r = quantumDiscordMap(simulate(circ(2, [gate("h", [0])]), {}).state, 2)!;
    expect(r.max).toBeLessThan(0.02);
  });
});
