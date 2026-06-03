// Verification for the new gate types: √Y/√Y†, R(θ,φ), fSim(θ,φ), √SWAP/√SWAP†.
// Matrix identities + OpenQASM 3 round-trip + inverse rules.
// Run with `npx tsx scripts/test-gates.ts` from client/.

import { buildMatrix, type Matrix } from "../src/sim/matrices";
import { emitQasm3 } from "../src/qasm/emit";
import { parseQasm3 } from "../src/qasm/parse";
import { invertGate } from "../src/editor/inverse";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

function matmul(A: Matrix, B: Matrix): Matrix {
  const n = A.length;
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const row: [number, number][] = [];
    for (let j = 0; j < n; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < n; k++) {
        const a = A[i][k], b = B[k][j];
        re += a[0] * b[0] - a[1] * b[1];
        im += a[0] * b[1] + a[1] * b[0];
      }
      row.push([re, im]);
    }
    out.push(row);
  }
  return out;
}
function dagger(A: Matrix): Matrix {
  const n = A.length;
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const row: [number, number][] = [];
    for (let j = 0; j < n; j++) row.push([A[j][i][0], -A[j][i][1]]);
    out.push(row);
  }
  return out;
}
function matEq(A: Matrix, B: Matrix, eps = 1e-9): boolean {
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A.length; j++)
      if (Math.abs(A[i][j][0] - B[i][j][0]) > eps || Math.abs(A[i][j][1] - B[i][j][1]) > eps) return false;
  return true;
}
const M = (id: string, p: number[] = []) => buildMatrix(id, p)!;

// ── √Y ──────────────────────────────────────────────────────────────
check("√Y² = Y", matEq(matmul(M("sy"), M("sy")), M("y")));
check("√Y† = dagger(√Y)", matEq(M("sydg"), dagger(M("sy"))));
check("√Y · √Y† = I", matEq(matmul(M("sy"), M("sydg")), M("i")));

// ── R(θ,φ) ──────────────────────────────────────────────────────────
check("R(θ,0) = RX(θ)", matEq(M("r", [0.7, 0]), M("rx", [0.7])));
check("R(θ,π/2) = RY(θ)", matEq(M("r", [0.7, Math.PI / 2]), M("ry", [0.7])));

// ── fSim(θ,φ) ───────────────────────────────────────────────────────
check("fSim(−π/2, 0) = iSWAP", matEq(M("fsim", [-Math.PI / 2, 0]), M("iswap")));
check("fSim(0, π) = CZ", matEq(M("fsim", [0, Math.PI]), M("cz")));

// ── √SWAP ───────────────────────────────────────────────────────────
check("√SWAP² = SWAP", matEq(matmul(M("sqrtswap"), M("sqrtswap")), M("swap")));
check("√SWAP† = dagger(√SWAP)", matEq(M("sqrtswapdg"), dagger(M("sqrtswap"))));
check("√SWAP · √SWAP† = I₄", matEq(matmul(M("sqrtswap"), M("sqrtswapdg")), M("swap").map((_, i) => M("swap")[i].map((__, j) => (i === j ? [1, 0] : [0, 0]) as [number, number]))));

// ── IonQ trio: GPi, GPi2, MS ────────────────────────────────────────
check("GPi(0) = X", matEq(M("gpi", [0]), M("x")));
check("GPi self-inverse (GPi² = I)", matEq(matmul(M("gpi", [0.9]), M("gpi", [0.9])), M("i")));
check("GPi2(φ) = R(π/2, φ)", matEq(M("gpi2", [1.1]), M("r", [Math.PI / 2, 1.1])));
check("GPi2(0) = RX(π/2)", matEq(M("gpi2", [0]), M("rx", [Math.PI / 2])));
check("GPi2(φ)† = GPi2(φ+π)", matEq(dagger(M("gpi2", [0.7])), M("gpi2", [0.7 + Math.PI])));
check("MS(0,0,π/2) = RXX(π/2)", matEq(M("ms", [0, 0, Math.PI / 2]), M("rxx", [Math.PI / 2])));
check("MS unitary (MS·MS† = I₄)", matEq(matmul(M("ms", [0.4, 0.9, 1.3]), dagger(M("ms", [0.4, 0.9, 1.3]))), M("ms", [0, 0, 0])));
check("MS(φ₀,φ₁,θ)† = MS(φ₀,φ₁,−θ)", matEq(dagger(M("ms", [0.4, 0.9, 1.3])), M("ms", [0.4, 0.9, -1.3])));
// MS decomposition (Rz·RXX·Rz) matches the matrix.
{
  const p0 = 0.4, p1 = 0.9, th = 1.3;
  const RzA = M("rz", [p0]), RzAi = M("rz", [-p0]);
  // (Rz(φ₀)⊗Rz(φ₁)) RXX(θ) (Rz(−φ₀)⊗Rz(−φ₁)) — build the 4×4 tensors.
  const kron = (A: Matrix, B: Matrix): Matrix => {
    const out: [number, number][][] = [];
    for (let i = 0; i < 4; i++) { const row: [number, number][] = []; for (let j = 0; j < 4; j++) {
      const a = A[i >> 1][j >> 1], b = B[i & 1][j & 1];
      row.push([a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]);
    } out.push(row); }
    return out;
  };
  const L = kron(RzA, M("rz", [p1])), Li = kron(RzAi, M("rz", [-p1]));
  const recon = matmul(matmul(L, M("rxx", [th])), Li);
  check("MS decomposition Rz·RXX·Rz matches matrix", matEq(recon, M("ms", [p0, p1, th]), 1e-9));
}

// ── OpenQASM 3 round-trip ───────────────────────────────────────────
let idc = 0;
function gate(gateId: string, targets: number[], params: string[] = [], column = 0): PlacedGate {
  return { id: `g${idc++}`, gateId: gateId as GateId, column, controls: [], targets, clbits: [], params };
}
{
  const circuit: Circuit = {
    numQubits: 2, numClbits: 0,
    gates: [
      gate("sy", [0], [], 0),
      gate("sydg", [1], [], 0),
      gate("r", [0], ["θ", "π/4"], 1),
      gate("fsim", [0, 1], ["π/3", "π/5"], 2),
      gate("sqrtswap", [0, 1], [], 3),
      gate("sqrtswapdg", [0, 1], [], 4),
      gate("gpi", [0], ["π/3"], 5),
      gate("gpi2", [1], ["π/6"], 5),
      gate("ms", [0, 1], ["0", "π/4", "π/2"], 6),
    ],
  };
  const qasm = emitQasm3(circuit);
  const res = parseQasm3(qasm);
  if (!res.ok) {
    check("QASM round-trip parses", false, JSON.stringify(res));
  } else {
    const ids = res.circuit.gates.map((g) => g.gateId);
    check("QASM round-trip: all gate ids preserved",
      ["sy", "sydg", "r", "fsim", "sqrtswap", "sqrtswapdg", "gpi", "gpi2", "ms"].every((id) => ids.includes(id)),
      ids.join(","));
    const ms = res.circuit.gates.find((g) => g.gateId === "ms")!;
    check("QASM round-trip: ms 3 params preserved", ms.params.length === 3, JSON.stringify(ms.params));
    const r = res.circuit.gates.find((g) => g.gateId === "r")!;
    check("QASM round-trip: r params preserved", r.params.length === 2 && r.params[1] === "π/4", JSON.stringify(r.params));
    const f = res.circuit.gates.find((g) => g.gateId === "fsim")!;
    check("QASM round-trip: fsim params preserved", f.params.length === 2, JSON.stringify(f.params));
  }
}

// ── Inverse rules ───────────────────────────────────────────────────
{
  const inv = (g: PlacedGate) => invertGate(g)!;
  // negateExpr wraps non-identifiers in -(...), so "0.7" → "-(0.7)" and a
  // bare symbol "θ" → "-θ". Check it parenthesise-negates and keeps φ.
  const r = inv(gate("r", [0], ["0.7", "1.2"]));
  check("R(θ,φ)† = R(−θ,φ)", r.gateId === "r" && r.params[0] === "-(0.7)" && r.params[1] === "1.2", JSON.stringify(r.params));
  const r2 = inv(gate("r", [0], ["θ", "φ"]));
  check("R(θ,φ)† symbolic = R(−θ,φ)", r2.params[0] === "-θ" && r2.params[1] === "φ", JSON.stringify(r2.params));
  const f = inv(gate("fsim", [0, 1], ["0.7", "1.2"]));
  check("fSim(θ,φ)† = fSim(−θ,−φ)", f.gateId === "fsim" && f.params[0] === "-(0.7)" && f.params[1] === "-(1.2)", JSON.stringify(f.params));
  check("√Y† inverse → √Y", inv(gate("sydg", [0])).gateId === "sy");
  check("√Y inverse → √Y†", inv(gate("sy", [0])).gateId === "sydg");
  check("√SWAP inverse → √SWAP†", inv(gate("sqrtswap", [0, 1])).gateId === "sqrtswapdg");
  check("GPi self-inverse (same gate)", inv(gate("gpi", [0], ["0.7"])).gateId === "gpi" && inv(gate("gpi", [0], ["0.7"])).params[0] === "0.7");
  const g2 = inv(gate("gpi2", [0], ["0.7"]));
  check("GPi2(φ)† = GPi2(φ+π)", g2.gateId === "gpi2" && g2.params[0] === "(0.7) + π", JSON.stringify(g2.params));
  const ms = inv(gate("ms", [0, 1], ["0.4", "0.9", "1.3"]));
  check("MS(φ₀,φ₁,θ)† = MS(φ₀,φ₁,−θ)", ms.gateId === "ms" && ms.params[0] === "0.4" && ms.params[2] === "-(1.3)", JSON.stringify(ms.params));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
