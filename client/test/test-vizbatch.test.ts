// Verification for the Tier-B visualisation batch + the H·CZ·H → CX
// peephole rule. Run with `npx tsx scripts/test-vizbatch.ts` from client/.

import { simulate } from "../src/sim/simulate";
import { optimiseCircuit } from "../src/sim/optimisePasses";
import { equivalenceCheck } from "../src/sim/equivalence";
import { entropyProfile } from "../src/sim/entanglement";
import { spaceTimeEntropy } from "../src/sim/spacetime";
import { interactionGraph } from "../src/sim/interaction";
import { buildUnitary } from "../src/sim/unitary";
import { tSweepSpectrum } from "../src/sim/tsweep";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";
import { check } from "./check";

let idc = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = [], column = 0): PlacedGate {
  return { id: `g${idc++}`, gateId: gateId as GateId, column, controls, targets, clbits: [], params };
}
function circ(numQubits: number, gates: PlacedGate[]): Circuit {
  return { numQubits, numClbits: 0, gates };
}


// ── 1. H·CZ·H → CX equivalence ────────────────────────────────────────
{
  // H(t) on qubit 1, CZ(0,1), H(1). Should equal CX(control 0, target 1).
  const src = circ(2, [
    gate("h", [1], [], [], 0),
    gate("cz", [1], [0], [], 1),
    gate("h", [1], [], [], 2),
  ]);
  const opt = optimiseCircuit(src);
  const target = circ(2, [gate("cx", [1], [0], [], 0)]);
  const eq = equivalenceCheck(opt.circuit, target, [], [], {});
  check("H·CZ·H → CX equivalent to CX", eq.equivalent, `dev=${eq.maxDeviation}`);
  check("H·CZ·H → CX rule fired", (opt.rulesFired["H·CZ·H → CX"] ?? 0) === 1);
  check("H·CZ·H → CX produces 1 gate", opt.circuit.gates.length === 1, `got ${opt.circuit.gates.length}`);

  // Sandwich on the control wire instead: H(0)·CZ(0,1)·H(0) → CX(1,0).
  const src2 = circ(2, [
    gate("h", [0], [], [], 0),
    gate("cz", [1], [0], [], 1),
    gate("h", [0], [], [], 2),
  ]);
  const opt2 = optimiseCircuit(src2);
  const target2 = circ(2, [gate("cx", [0], [1], [], 0)]);
  const eq2 = equivalenceCheck(opt2.circuit, target2, [], [], {});
  check("H·CZ·H on control wire → CX(1,0)", eq2.equivalent, `dev=${eq2.maxDeviation}`);
}

// ── 2. entropyProfile on a GHZ state ──────────────────────────────────
{
  // 4-qubit GHZ: every cut has S = 1 bit exactly.
  const ghz = circ(4, [
    gate("h", [0], [], [], 0),
    gate("cx", [1], [0], [], 1),
    gate("cx", [2], [1], [], 2),
    gate("cx", [3], [2], [], 3),
  ]);
  const res = simulate(ghz, {}, []);
  const prof = entropyProfile(res.state, 4)!;
  check("GHZ entropy profile flat at 1 bit",
    prof.entropy.every((s) => Math.abs(s - 1) < 1e-9),
    JSON.stringify(prof.entropy));

  // Product state |+>^4: every cut has S = 0.
  const prod = circ(4, [0, 1, 2, 3].map((q) => gate("h", [q], [], [], 0)));
  const prof2 = entropyProfile(simulate(prod, {}, []).state, 4)!;
  check("product-state entropy profile all zero",
    prof2.entropy.every((s) => Math.abs(s) < 1e-9), JSON.stringify(prof2.entropy));
}

// ── 3. spaceTimeEntropy: Bell pair lights up at the CX column ──────────
{
  const bell = circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]);
  const st = spaceTimeEntropy(bell, {}, [])!;
  // After column 0 (just H): both qubits still pure → S ≈ 0.
  check("Bell space-time entropy ~0 before CX",
    Math.abs(st.s[0][0]) < 1e-9 && Math.abs(st.s[1][0]) < 1e-9);
  // After column 1 (CX): both maximally entangled → S ≈ 1.
  check("Bell space-time entropy ~1 after CX",
    Math.abs(st.s[0][1] - 1) < 1e-9 && Math.abs(st.s[1][1] - 1) < 1e-9,
    `${st.s[0][1]}, ${st.s[1][1]}`);
}

// ── 4. interactionGraph counts ─────────────────────────────────────────
{
  const c = circ(3, [
    gate("cx", [1], [0], [], 0),
    gate("cx", [1], [0], [], 1), // same pair again
    gate("ccx", [2], [0, 1], [], 2), // 3-qubit: lights all 3 pairs
  ]);
  const ig = interactionGraph(c);
  check("interaction weight (0,1) = 3", ig.weight[0][1] === 3, `${ig.weight[0][1]}`);
  check("interaction weight (0,2) = 1", ig.weight[0][2] === 1);
  check("interaction weight (1,2) = 1", ig.weight[1][2] === 1);
  check("interaction maxWeight = 3", ig.maxWeight === 3);
}

// ── 5. buildUnitary: CX is a real permutation ──────────────────────────
{
  const cx = circ(2, [gate("cx", [1], [0], [], 0)]);
  const u = buildUnitary(cx, {}, [])!;
  // CX matrix rows (big-endian q0=MSB): |00>->|00>, |01>->|01>, |10>->|11>, |11>->|10>.
  const expect = [[0,0],[1,1],[2,3],[3,2]]; // (row, col) ones
  const ok = expect.every(([r, c]) => Math.abs(u.mag[r * 4 + c] - 1) < 1e-9);
  let offDiag = 0;
  for (let i = 0; i < 16; i++) { const isOne = expect.some(([r,c]) => r*4+c === i); if (!isOne) offDiag += u.mag[i]; }
  check("CX unitary has 4 unit entries in the right cells", ok);
  check("CX unitary has no spurious magnitude", offDiag < 1e-9, `${offDiag}`);
}

// ── 6. tSweepSpectrum: rx(t) peaks at bin 1 ────────────────────────────
{
  // ⟨Z⟩ for rx(t)|0> = cos(t): one full oscillation over [0,2π) → bin 1.
  const c = circ(1, [gate("rx", [0], [], ["t"], 0)]);
  const sp = tSweepSpectrum(c, {}, [], 128)!;
  const bins = sp.mag[0];
  const peak = bins.indexOf(Math.max(...bins.slice(1)));
  check("rx(t) spectrum peaks at bin 1", peak === 1, `peak at ${peak}`);
  check("rx(t) bin-1 amplitude ~1", Math.abs(bins[1] - 1) < 1e-6, `${bins[1]}`);
}

