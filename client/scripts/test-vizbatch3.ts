// Verification for gap-item batch: PTM, OTOC, Hamiltonian spectrum, Tanner.
// Run with `npx tsx scripts/test-vizbatch3.ts` from client/.

import { pauliTransferMatrix } from "../src/sim/ptm";
import { otoc } from "../src/sim/otoc";
import { hamiltonianSpectrum } from "../src/sim/hamSpectrum";
import { parsePauliSum } from "../src/sim/trotter";
import { tannerGraph } from "../src/sim/tanner";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";

let idc = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = [], column = 0, clbits: number[] = []): PlacedGate {
  return { id: `g${idc++}`, gateId: gateId as GateId, column, controls, targets, clbits, params };
}
function circ(numQubits: number, gates: PlacedGate[], numClbits = 0): Circuit {
  return { numQubits, numClbits, gates };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── PTM ──────────────────────────────────────────────────────────────
{
  // Hadamard PTM (1 qubit): I→I, X→Z, Y→−Y, Z→X. Labels [I,X,Y,Z].
  const h = circ(1, [gate("h", [0])]);
  const { R, labels } = pauliTransferMatrix(h, {}, [])!;
  // index: I=0,X=1,Y=2,Z=3.
  check("PTM(H) labels", labels.join(",") === "I,X,Y,Z");
  check("PTM(H) I→I = 1", approx(R[0][0], 1));
  check("PTM(H) X→Z (R[Z][X]=1)", approx(R[3][1], 1), `${R[3][1]}`);
  check("PTM(H) Z→X (R[X][Z]=1)", approx(R[1][3], 1), `${R[1][3]}`);
  check("PTM(H) Y→−Y (R[Y][Y]=−1)", approx(R[2][2], -1), `${R[2][2]}`);

  // S gate PTM: X→Y, Y→−X, Z→Z, I→I.
  const s = circ(1, [gate("s", [0])]);
  const Rs = pauliTransferMatrix(s, {}, [])!.R;
  check("PTM(S) X→Y (R[Y][X]=1)", approx(Rs[2][1], 1), `${Rs[2][1]}`);
  check("PTM(S) Y→−X (R[X][Y]=−1)", approx(Rs[1][2], -1), `${Rs[1][2]}`);
  check("PTM(S) Z→Z = 1", approx(Rs[3][3], 1));

  // CNOT PTM (2 qubits): every row/column is a signed unit (orthogonal,
  // ±1 entries). Check it's a signed permutation: each row has exactly one
  // ±1 and zeros elsewhere.
  const cx = circ(2, [gate("cx", [1], [0])]);
  const Rcx = pauliTransferMatrix(cx, {}, [])!.R;
  let signedPerm = true;
  for (let i = 0; i < 16; i++) {
    let nz = 0;
    for (let j = 0; j < 16; j++) {
      const v = Rcx[i][j];
      if (Math.abs(v) > 1e-9) { nz++; if (!approx(Math.abs(v), 1)) signedPerm = false; }
    }
    if (nz !== 1) signedPerm = false;
  }
  check("PTM(CNOT) is a signed permutation", signedPerm);
}

// ── OTOC ──────────────────────────────────────────────────────────────
{
  // No entangling dynamics: identity-ish circuit with rz(t) only on q0.
  // W=Z@1, V=Z@0 commute through (Z commutes with Z-rotation) → C(t)=0.
  const c = circ(2, [gate("rz", [0], [], ["t"], 0)]);
  const r = otoc(c, {}, [], 1, 0, "Z", "Z", 24)!;
  check("OTOC C(t)≈0 when W,V never interact", r.C.every((v) => Math.abs(v) < 1e-6), `max=${Math.max(...r.C.map(Math.abs))}`);

  // rzz(t) coupling: W=X@1 gets rotated by the ZZ coupling into a term with
  // Z-support on q0, so it stops commuting with V=X@0 → C(t) rises.
  const c2 = circ(2, [gate("rzz", [0, 1], [], ["t"], 0)]);
  const r2 = otoc(c2, {}, [], 1, 0, "X", "X", 24)!;
  check("OTOC rises under rzz coupling", Math.max(...r2.C) > 0.1, `peak=${Math.max(...r2.C)}`);
  // C(0) should be ~0 (t=0 ⇒ U=I ⇒ W(0)=W, and at t=0 [W,V] on different
  // qubits commute → C=0).
  check("OTOC C(0)=0", approx(r2.C[0], 0, 1e-6), `${r2.C[0]}`);
}

// ── Hamiltonian spectrum ───────────────────────────────────────────────
{
  // H = Z (1 qubit): eigenvalues {−1, +1}.
  const s1 = hamiltonianSpectrum(parsePauliSum("1*Z"), 1)!;
  check("spec(Z) = {−1,+1}", approx(s1.energies[0], -1) && approx(s1.energies[1], 1), JSON.stringify(s1.energies));
  check("spec(Z) gap = 2", approx(s1.gap, 2));

  // H = XX + YY + ZZ (Heisenberg, 2q): eigenvalues {−3, +1, +1, +1}
  // (singlet at −3, triplet at +1).
  const s2 = hamiltonianSpectrum(parsePauliSum("1*XX + 1*YY + 1*ZZ"), 2)!;
  const e = s2.energies.map((x) => Number(x.toFixed(4)));
  check("spec(Heisenberg) ground = −3", approx(s2.ground, -3, 1e-6), JSON.stringify(e));
  check("spec(Heisenberg) triplet at +1", approx(s2.energies[1], 1, 1e-6) && approx(s2.energies[3], 1, 1e-6), JSON.stringify(e));

  // H = X (1q): eigenvalues {−1,+1} (eigenstates |±⟩).
  const s3 = hamiltonianSpectrum(parsePauliSum("1*X"), 1)!;
  check("spec(X) = {−1,+1}", approx(s3.energies[0], -1) && approx(s3.energies[1], 1));
}

// ── Tanner graph ────────────────────────────────────────────────────────
{
  // 3-qubit repetition-code-style: two parity checks via ancillas.
  // q0,q1 data; measure each into clbits after CX entangling — here a
  // simple syndrome: CX(0->2), CX(1->2), measure q2.
  const c = circ(3, [
    gate("cx", [2], [0], [], 0),
    gate("cx", [2], [1], [], 1),
    gate("measure", [2], [], [], 2, [0]),
  ], 1);
  const tg = tannerGraph(c);
  check("tanner: 1 check", tg.checks.length === 1);
  check("tanner: check support = {0,1,2}", tg.checks[0].support.join(",") === "0,1,2", tg.checks[0].support.join(","));

  // No measurements → no checks.
  const c2 = circ(2, [gate("h", [0]), gate("cx", [1], [0])]);
  check("tanner: no measurements → 0 checks", tannerGraph(c2).checks.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
