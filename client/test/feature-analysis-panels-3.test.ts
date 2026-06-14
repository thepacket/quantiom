import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { circ, gate } from "./helpers";
import { mpsBondDimension } from "../src/sim/mpsBondDimension";
import { negativitySpectrum } from "../src/sim/negativitySpectrum";
import { threeTangle } from "../src/sim/threeTangle";
import { totalCorrelation } from "../src/sim/totalCorrelation";
import { entanglementVelocity } from "../src/sim/entanglementVelocity";
import { anticoncentration } from "../src/sim/anticoncentration";
import { effectiveTemperature } from "../src/sim/effectiveTemperature";
import { coherentInformation } from "../src/sim/coherentInformation";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function bell() {
  return simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
}
function ghz(n: number) {
  const gates = [gate("h", [0])];
  for (let q = 1; q < n; q++) gates.push(gate("cx", [q], [q - 1]));
  return simulate(circ(n, gates), {}).state;
}
describe("mpsBondDimension", () => {
  test("product state needs χ = 1 everywhere", () => {
    const r = mpsBondDimension(simulate(circ(3, [gate("x", [1])]), {}).state, 3)!;
    expect(r.maxChi).toBe(1);
  });

  test("Bell needs χ = 2 (rank-2 across the cut)", () => {
    const r = mpsBondDimension(bell(), 2)!;
    expect(r.maxChi).toBe(2);
    expect(r.chi[0]).toBe(2);
  });
});

describe("negativitySpectrum", () => {
  test("Bell across {0}: negativity ½, log-negativity 1", () => {
    const r = negativitySpectrum(bell(), 2, [0])!;
    expect(close(r.negativity, 0.5, 1e-6)).toBe(true);
    expect(close(r.logNegativity, 1, 1e-6)).toBe(true);
  });

  test("product state has no negativity", () => {
    const r = negativitySpectrum(simulate(circ(2, [gate("x", [1])]), {}).state, 2, [0])!;
    expect(close(r.negativity, 0)).toBe(true);
  });
});

describe("threeTangle", () => {
  test("GHZ-3 has τ₃ = 1 (genuine tripartite)", () => {
    const r = threeTangle(ghz(3), 3, 0, 1, 2)!;
    expect(close(r.tau3, 1, 1e-5)).toBe(true);
    expect(close(r.oneTangle, 1, 1e-5)).toBe(true);
    expect(close(r.cab2, 0, 1e-5)).toBe(true);
  });

  test("W state has τ₃ = 0 (purely pairwise)", () => {
    // W = (|100⟩+|010⟩+|001⟩)/√3.
    const s = new Float64Array(2 * 8);
    const a = 1 / Math.sqrt(3);
    for (const idx of [0b100, 0b010, 0b001]) s[2 * idx] = a;
    const r = threeTangle(s, 3, 0, 1, 2)!;
    expect(r.tau3).toBeLessThan(1e-4);
    expect(r.oneTangle).toBeGreaterThan(0.1); // it is entangled, just not tripartite
  });

  test("rejects non-3-qubit states", () => {
    expect(threeTangle(bell(), 2, 0, 1, 1 as number)).toBeNull();
  });
});

describe("totalCorrelation", () => {
  test("GHZ-4: total = 4 bits (each qubit maximally mixed)", () => {
    const r = totalCorrelation(ghz(4), 4)!;
    expect(close(r.total, 4, 1e-5)).toBe(true);
  });

  test("product state: total = 0", () => {
    const r = totalCorrelation(simulate(circ(3, [gate("x", [1])]), {}).state, 3)!;
    expect(close(r.total, 0)).toBe(true);
  });
});

describe("entanglementVelocity", () => {
  test("static circuit has zero growth", () => {
    const r = entanglementVelocity(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}, [])!;
    expect(close(r.velocity, 0, 1e-9)).toBe(true);
  });

  test("a t-dependent circuit grows entanglement (velocity > 0)", () => {
    // rx(t) on q0 then CX entangles q0,q1 as t advances.
    const c = circ(2, [gate("rx", [0], [], ["t"]), gate("cx", [1], [0])]);
    const r = entanglementVelocity(c, {}, [])!;
    expect(r.velocity).toBeGreaterThan(0);
  });
});

describe("anticoncentration", () => {
  test("computational basis state is maximally peaked (R = D)", () => {
    const r = anticoncentration(simulate(circ(3, []), {}).state, 3)!;
    expect(close(r.collisionRatio, 8, 1e-6)).toBe(true); // D = 2^3
  });

  test("uniform superposition is flat (R = 1)", () => {
    const r = anticoncentration(simulate(circ(3, [gate("h", [0]), gate("h", [1]), gate("h", [2])]), {}).state, 3)!;
    expect(close(r.collisionRatio, 1, 1e-6)).toBe(true);
  });
});

describe("effectiveTemperature", () => {
  test("a Boltzmann distribution recovers its β with R² = 1", () => {
    const energies = [-2, -1, 0, 1, 2];
    const beta = 0.8;
    const raw = energies.map((e) => Math.exp(-beta * e));
    const Z = raw.reduce((a, b) => a + b, 0);
    const populations = raw.map((p) => p / Z);
    const diag = { energies, populations, meanEnergy: 0, energySpread: 0, ipr: 0, effectiveDim: 0, numQubits: 3, dim: 8 };
    const r = effectiveTemperature(diag);
    expect(close(r.beta, beta, 1e-6)).toBe(true);
    expect(close(r.r2, 1, 1e-6)).toBe(true);
  });
});

describe("coherentInformation", () => {
  test("pure Bell state: I_c = S(ρ_B) − 0 = 1 bit", () => {
    // Build ρ = |Bell⟩⟨Bell| as an interleaved density matrix.
    const psi = bell();
    const dim = 4;
    const rho = new Float64Array(2 * dim * dim);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) {
      const o = 2 * (i * dim + j);
      const ar = psi[2 * i], ai = psi[2 * i + 1];
      const br = psi[2 * j], bj = psi[2 * j + 1];
      rho[o] = ar * br + ai * bj;       // Re(ψ_i conj(ψ_j))
      rho[o + 1] = ai * br - ar * bj;   // Im
    }
    const r = coherentInformation(rho, 2, [0])!;
    expect(close(r.sFull, 0, 1e-6)).toBe(true);
    expect(close(r.sB, 1, 1e-6)).toBe(true);
    expect(close(r.coherentInfo, 1, 1e-6)).toBe(true);
  });

  test("maximally mixed 2-qubit ρ: I_c = S(B) − S(full) = 1 − 2 = −1", () => {
    const dim = 4;
    const rho = new Float64Array(2 * dim * dim);
    for (let i = 0; i < dim; i++) rho[2 * (i * dim + i)] = 0.25;
    const r = coherentInformation(rho, 2, [0])!;
    expect(close(r.sFull, 2, 1e-6)).toBe(true);
    expect(close(r.sB, 1, 1e-6)).toBe(true);
    expect(close(r.coherentInfo, -1, 1e-6)).toBe(true);
  });
});
