import { describe, test, expect } from "vitest";
import { simulate } from "../src/sim/simulate";
import { blochTrajectories } from "../src/sim/blochPath";
import { zzCorrelations } from "../src/sim/correlations";
import { spaceTimeZ } from "../src/sim/spacetime";
import { tSweepZ } from "../src/sim/tsweep";
import { mutualInformationMatrix, entanglementSpectrum } from "../src/sim/entanglement";
import { reducedDensityMatrix, purity } from "../src/sim/density";
import { zxDiagram } from "../src/sim/zx";
import { circ, gate } from "./helpers";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Reference states.
const bell = () => simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
const product = () => simulate(circ(2, []), {}).state; // |00⟩
const ghz3 = () => simulate(circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]), {}).state;

// ── Bloch-trajectory panel ──────────────────────────────────────────────
describe("blochTrajectories (Bloch-trajectory panel)", () => {
  test("RX(t)|0⟩ traces the YZ great circle: z = cos t, x = 0, y² = sin² t", () => {
    const r = blochTrajectories(circ(1, [gate("rx", [0], [], ["t"])]), {}, [], 64);
    expect(r).not.toBeNull();
    const path = r!.path[0];
    expect(path.length).toBe(64);
    for (let k = 0; k < 64; k++) {
      const t = (2 * Math.PI * k) / 63;
      const p = path[k];
      expect(close(p.z, Math.cos(t), 1e-9)).toBe(true);
      expect(close(p.x, 0, 1e-9)).toBe(true);
      expect(close(p.y * p.y, Math.sin(t) ** 2, 1e-9)).toBe(true);
    }
  });
});

// ── ZZ-correlation panel ────────────────────────────────────────────────
describe("zzCorrelations (ZZ-correlation panel)", () => {
  test("Bell state: connected ⟨Z₀Z₁⟩ = 1, ⟨Z_i⟩ = 0", () => {
    const r = zzCorrelations(bell(), 2)!;
    expect(close(r.z[0], 0)).toBe(true);
    expect(close(r.z[1], 0)).toBe(true);
    expect(close(r.conn[0][1], 1)).toBe(true); // ⟨Z₀Z₁⟩ − ⟨Z₀⟩⟨Z₁⟩ = 1 − 0
    expect(close(r.conn[1][0], 1)).toBe(true); // symmetric
  });
  test("product |00⟩: connected correlator vanishes", () => {
    const r = zzCorrelations(product(), 2)!;
    expect(close(r.z[0], 1)).toBe(true);
    expect(close(r.conn[0][1], 0)).toBe(true); // 1 − 1·1
  });
});

// ── Space-time ⟨Z⟩ panel ────────────────────────────────────────────────
describe("spaceTimeZ (space-time ⟨Z⟩ panel)", () => {
  test("X·X on one qubit: ⟨Z⟩ goes −1 then +1 column by column", () => {
    const r = spaceTimeZ(circ(1, [gate("x", [0], [], [], 0), gate("x", [0], [], [], 1)]), {}, [])!;
    expect(r.numCols).toBe(2);
    expect(close(r.z[0][0], -1)).toBe(true); // after first X
    expect(close(r.z[0][1], 1)).toBe(true);  // after second X
  });
});

// ── t-sweep traces panel ────────────────────────────────────────────────
describe("tSweepZ (t-sweep traces panel)", () => {
  test("RX(t)|0⟩: ⟨Z⟩(t) = cos t over the sweep", () => {
    const r = tSweepZ(circ(1, [gate("rx", [0], [], ["t"])]), {}, [], 64)!;
    expect(r.z[0].length).toBe(64);
    for (let k = 0; k < 64; k++) {
      expect(close(r.z[0][k], Math.cos(r.ts[k]), 1e-9)).toBe(true);
    }
  });
});

// ── Mutual-information panel ────────────────────────────────────────────
describe("mutualInformationMatrix (mutual-information panel)", () => {
  test("Bell: I(0:1) = 2 bits, single-qubit entropy = 1 bit", () => {
    const r = mutualInformationMatrix(bell(), 2)!;
    expect(close(r.mi[0][1], 2, 1e-9)).toBe(true);
    expect(close(r.single[0], 1, 1e-9)).toBe(true);
    expect(close(r.single[1], 1, 1e-9)).toBe(true);
    expect(close(r.mi[0][0], 0)).toBe(true); // diagonal is zero
  });
  test("product |00⟩: zero mutual information", () => {
    const r = mutualInformationMatrix(product(), 2)!;
    expect(close(r.mi[0][1], 0, 1e-9)).toBe(true);
    expect(close(r.single[0], 0, 1e-9)).toBe(true);
  });
  test("3-qubit GHZ: I(i:j) = 1 bit for every pair", () => {
    const r = mutualInformationMatrix(ghz3(), 3)!;
    expect(close(r.mi[0][1], 1, 1e-9)).toBe(true);
    expect(close(r.mi[0][2], 1, 1e-9)).toBe(true);
    expect(close(r.mi[1][2], 1, 1e-9)).toBe(true);
  });
});

// ── Schmidt / entanglement-spectrum panel ───────────────────────────────
describe("entanglementSpectrum (Schmidt panel)", () => {
  test("Bell across the {0}|{1} cut: spectrum {½,½}, entropy 1 bit, rank 2", () => {
    const r = entanglementSpectrum(bell(), 2, [0])!;
    expect(r.rank).toBe(2);
    expect(close(r.entropy, 1, 1e-9)).toBe(true);
    expect(r.spectrum.map((x) => Math.round(x * 1000) / 1000).sort()).toEqual([0.5, 0.5]);
  });
  test("product state: spectrum {1,0}, entropy 0, rank 1", () => {
    const r = entanglementSpectrum(product(), 2, [0])!;
    expect(r.rank).toBe(1);
    expect(close(r.entropy, 0, 1e-9)).toBe(true);
  });
});

// ── Density panel (reduced density matrix + purity) ─────────────────────
describe("reducedDensityMatrix / purity (Density panel)", () => {
  test("Bell reduced to qubit 0 is the maximally mixed state I/2", () => {
    const rho = reducedDensityMatrix(bell(), 2, [0]);
    expect(close(rho[0][0].re, 0.5)).toBe(true);
    expect(close(rho[1][1].re, 0.5)).toBe(true);
    expect(close(rho[0][1].re, 0) && close(rho[0][1].im, 0)).toBe(true);
    expect(close(purity(rho), 0.5)).toBe(true); // Tr(ρ²) = ½ ⇒ maximally mixed
  });
  test("product state reduced to qubit 0 is pure (purity 1)", () => {
    const rho = reducedDensityMatrix(product(), 2, [0]);
    expect(close(rho[0][0].re, 1)).toBe(true);
    expect(close(purity(rho), 1)).toBe(true);
  });
});

// ── ZX-diagram panel ────────────────────────────────────────────────────
describe("zxDiagram (ZX-diagram panel)", () => {
  test("maps gates to Z/X spiders, H nodes, and generic boxes", () => {
    const c = circ(2, [
      gate("z", [0], [], [], 0),         // Z spider (π)
      gate("x", [0], [], [], 1),         // X spider (π)
      gate("rx", [0], [], ["0.5"], 2),   // X spider (param)
      gate("rz", [1], [], ["0.7"], 3),   // Z spider (param)
      gate("h", [0], [], [], 4),         // H node
      gate("swap", [0, 1], [], [], 5),   // not a spider → generic box on each wire
    ]);
    const d = zxDiagram(c);
    const ofKind = (k: string) => d.nodes.filter((n) => n.kind === k);
    expect(ofKind("Z").length).toBeGreaterThanOrEqual(2); // z + rz
    expect(ofKind("X").length).toBeGreaterThanOrEqual(2); // x + rx
    expect(ofKind("H").length).toBeGreaterThanOrEqual(1); // h
    const boxes = ofKind("box");
    expect(boxes.length).toBeGreaterThanOrEqual(2);       // swap → box on both wires
    expect(boxes.some((n) => n.label === "swap")).toBe(true);
    expect(d.edges.length).toBeGreaterThanOrEqual(1);     // box wires connected
    expect(d.numQubits).toBe(2);
  });

  test("CX is a plain edge between Z (control) and X (target) spiders", () => {
    const d = zxDiagram(circ(2, [gate("cx", [1], [0])]));
    expect(d.nodes.some((n) => n.kind === "Z")).toBe(true);
    expect(d.nodes.some((n) => n.kind === "X")).toBe(true);
    expect(d.edges.length).toBeGreaterThanOrEqual(1);
  });
});
