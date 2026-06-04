// Verification for the reopened classics: Q-sphere, Husimi-Q, ZX diagram.
// Run with `npx tsx scripts/test-vizbatch4.ts` from client/.

import { simulate } from "../src/sim/simulate";
import { qSphere } from "../src/sim/qsphere";
import { husimiQ } from "../src/sim/husimi";
import { zxDiagram } from "../src/sim/zx";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";
import { check } from "./check";

let idc = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = [], column = 0): PlacedGate {
  return { id: `g${idc++}`, gateId: gateId as GateId, column, controls, targets, clbits: [], params };
}
function circ(numQubits: number, gates: PlacedGate[]): Circuit {
  return { numQubits, numClbits: 0, gates };
}

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── Q-sphere ────────────────────────────────────────────────────────
{
  // GHZ-3: two points (|000⟩ weight 0 at north pole, |111⟩ weight 3 at
  // south pole), each |amp| = 1/√2.
  const ghz = circ(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]);
  const qs = qSphere(simulate(ghz, {}, []).amplitudes, 3)!;
  const big = qs.points.filter((p) => p.mag > 1e-6);
  check("Q-sphere GHZ: 2 populated points", big.length === 2, `${big.length}`);
  check("Q-sphere GHZ: |000⟩ at north pole z=+1", big.some((p) => p.basis === "000" && approx(p.z, 1)));
  check("Q-sphere GHZ: |111⟩ at south pole z=−1", big.some((p) => p.basis === "111" && approx(p.z, -1)));
  check("Q-sphere GHZ: mag 1/√2", big.every((p) => approx(p.mag, Math.SQRT1_2)));

  // W-3: three points all at weight 1 (same latitude ring), equal mag.
  const w = circ(3, [
    gate("ry", [0], [], ["1.9106332"], 0), // ~arccos-ish; just need weight-1 support
    gate("ch", [1], [0], [], 1),
    gate("cx", [0], [1], [], 2),
  ]);
  // Simpler deterministic weight-1 ring: prepare |100>+|010>+|001> isn't a
  // 1-liner; instead check the ring structure on a uniform weight-1-ish
  // state via explicit amplitudes is overkill — check |001> sits on the
  // weight-1 ring (z between poles) for a basis state.
  const one = circ(3, [gate("x", [2], [], [], 0)]); // |001>
  const qs1 = qSphere(simulate(one, {}, []).amplitudes, 3)!;
  const p001 = qs1.points.find((p) => p.basis === "001")!;
  check("Q-sphere weight-1 on intermediate ring", Math.abs(p001.z) < 1 && p001.weight === 1, `z=${p001.z}`);
}

// ── Husimi Q ────────────────────────────────────────────────────────
{
  // |0⟩ single qubit: coherent overlap peaks at θ=0 (north pole), Q=1 there,
  // Q=0 at θ=π.
  const z = simulate(circ(1, [gate("i", [0])]), {}, []);
  const hz = husimiQ(z.state, 1, 33, 16)!;
  check("Husimi |0⟩ peak at θ=0", approx(hz.Q[0][0], 1, 1e-6), `${hz.Q[0][0]}`);
  check("Husimi |0⟩ ~0 at θ=π", hz.Q[hz.nTheta - 1][0] < 1e-6, `${hz.Q[hz.nTheta - 1][0]}`);
  check("Husimi non-negative", hz.Q.every((row) => row.every((v) => v >= -1e-12)));

  // |1⟩: peaks at θ=π (south pole).
  const o = simulate(circ(1, [gate("x", [0])]), {}, []);
  const ho = husimiQ(o.state, 1, 33, 16)!;
  check("Husimi |1⟩ peak at θ=π", approx(ho.Q[ho.nTheta - 1][0], 1, 1e-6), `${ho.Q[ho.nTheta - 1][0]}`);
  check("Husimi |1⟩ ~0 at θ=0", ho.Q[0][0] < 1e-6);

  // GHZ-2 (Bell): two antipodal lobes — Q at poles equal and the largest.
  const bell = simulate(circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]), {}, []);
  const hb = husimiQ(bell.state, 2, 33, 16)!;
  const north = hb.Q[0][0], south = hb.Q[hb.nTheta - 1][0];
  check("Husimi Bell: antipodal lobes equal", approx(north, south, 1e-6) && north > 0.1, `${north}, ${south}`);
}

// ── ZX diagram ──────────────────────────────────────────────────────
{
  // H · CX: one H box on q0, then CX → green(q0)+red(q1) + 1 edge.
  const c = circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
  const zx = zxDiagram(c);
  const zCount = zx.nodes.filter((nd) => nd.kind === "Z").length;
  const xCount = zx.nodes.filter((nd) => nd.kind === "X").length;
  const hCount = zx.nodes.filter((nd) => nd.kind === "H").length;
  check("ZX H·CX: 1 H box", hCount === 1, `${hCount}`);
  check("ZX H·CX: 1 Z spider (cx control)", zCount === 1, `${zCount}`);
  check("ZX H·CX: 1 X spider (cx target)", xCount === 1, `${xCount}`);
  check("ZX H·CX: 1 edge", zx.edges.length === 1 && !zx.edges[0].hadamard);

  // T gate → green spider phase π/4.
  const t = circ(1, [gate("t", [0])]);
  const zt = zxDiagram(t);
  check("ZX T: green spider phase π/4", zt.nodes[0].kind === "Z" && zt.nodes[0].phase === "π/4");

  // CZ → two green spiders + 1 Hadamard edge.
  const cz = circ(2, [gate("cz", [1], [0])]);
  const zcz = zxDiagram(cz);
  check("ZX CZ: 2 Z spiders + H-edge", zcz.nodes.filter((n) => n.kind === "Z").length === 2 && zcz.edges.length === 1 && zcz.edges[0].hadamard);

  // Fusable hint: T·T on a wire → 2 same-colour adjacent spiders → 1 fusable pair.
  const tt = circ(1, [gate("t", [0], [], [], 0), gate("t", [0], [], [], 1)]);
  check("ZX fusable hint counts adjacent same-colour", zxDiagram(tt).fusableHint === 1, `${zxDiagram(tt).fusableHint}`);
}

