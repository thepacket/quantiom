/**
 * In-browser self-test: a curated, representative cross-section of
 * Quantiom's numeric core, runnable live from the app's "Self-test" button.
 *
 * This is NOT the project's full test suite — that's ~358 Vitest cases run
 * in Node and in CI on every commit (see `client/test/` and
 * `.github/workflows/ci.yml`). This module exists for a different purpose:
 * to let a sceptical researcher press a button and watch the same
 * simulator/emitter/transpiler code that's powering their session validate
 * itself against analytic ground truth, in *their* browser, right now.
 *
 * Everything here runs against modules already in the app bundle, so the
 * only marginal weight is this file — and it's dynamically imported by the
 * modal, so it costs nothing until the user opens the dialog.
 *
 * Each check is wrapped so a thrown error becomes a failed check (with the
 * message as detail) rather than aborting the run.
 */
import { simulate } from "../sim/simulate";
import { buildMatrix, type Matrix } from "../sim/matrices";
import { GATES } from "../editor/gates";
import { runClifford } from "../sim/stabilizer";
import { mulberry32 } from "../sim/measure";
import { paulis, type Pauli } from "../sim/expectation";
import { estimateResources } from "../sim/resources";
import { equivalenceCheck } from "../sim/equivalence";
import { invertGate } from "../editor/inverse";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import { emitQiskit } from "../qasm/emitQiskit";
import { emitCirq } from "../qasm/emitCirq";
import { emitBraket } from "../qasm/emitBraket";
import { emitQSharp } from "../qasm/emitQSharp";
import { emitPyQuil } from "../qasm/emitPyQuil";
import { emitPytket } from "../qasm/emitPytket";
import { emitQasm2 } from "../qasm/emitQasm2";
import { emitQuantikz } from "../qasm/emitQuantikz";
import { transpile } from "../sim/transpile";
import { parsePauliSum, buildTrotterCircuit } from "../sim/trotter";
import type { Circuit, PlacedGate, GateId } from "../editor/types";

export type CheckResult = { name: string; passed: boolean; detail?: string };
export type CheckGroup = { name: string; checks: CheckResult[] };
export type SelfTestReport = {
  groups: CheckGroup[];
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
};

// ── tiny builders ───────────────────────────────────────────────────────
let _id = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = [], column = 0): PlacedGate {
  return { id: `s${_id++}`, gateId: gateId as GateId, column, controls, targets, clbits: [], params };
}
function circ(numQubits: number, gates: PlacedGate[], numClbits = 0): Circuit {
  return { numQubits, numClbits, gates: gates.map((g, i) => (g.column === 0 ? { ...g, column: i } : g)) };
}
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
function probOf(res: ReturnType<typeof simulate>, label: string): number {
  const a = res.amplitudes.find((x) => x.basis === label);
  return a ? a.re * a.re + a.im * a.im : 0;
}

// ── complex-matrix utilities ────────────────────────────────────────────
function matmul(A: Matrix, B: Matrix): Matrix {
  const n = A.length, m = B[0].length, inner = B.length;
  const out: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const row: [number, number][] = [];
    for (let j = 0; j < m; j++) {
      let re = 0, im = 0;
      for (let k = 0; k < inner; k++) {
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
  const out: [number, number][][] = [];
  for (let j = 0; j < A[0].length; j++) {
    const row: [number, number][] = [];
    for (let i = 0; i < A.length; i++) row.push([A[i][j][0], -A[i][j][1]]);
    out.push(row);
  }
  return out;
}
function isUnitary(A: Matrix, eps = 1e-9): boolean {
  const P = matmul(A, dagger(A));
  for (let i = 0; i < P.length; i++)
    for (let j = 0; j < P.length; j++)
      if (Math.abs(P[i][j][0] - (i === j ? 1 : 0)) > eps || Math.abs(P[i][j][1]) > eps) return false;
  return true;
}
function matEq(A: Matrix, B: Matrix, eps = 1e-9): boolean {
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[0].length; j++)
      if (Math.abs(A[i][j][0] - B[i][j][0]) > eps || Math.abs(A[i][j][1] - B[i][j][1]) > eps) return false;
  return true;
}
const P = (s: string): Pauli[] => s.split("") as Pauli[];

// Sample params for the gate-unitarity sweep (mirrors the Vitest suite).
const GATE_PARAMS: Record<string, number[]> = {
  p: [0.7], rx: [0.7], ry: [1.1], rz: [-0.4], r: [0.7, 1.3], gpi: [0.9], gpi2: [0.5],
  u: [0.7, 1.1, -0.4], u1: [0.7], u2: [0.7, 1.1], u3: [0.7, 1.1, -0.4],
  u_arb: [Math.SQRT1_2, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
  u_arb_2: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  crx: [0.7], cry: [1.1], crz: [-0.4], cp: [0.7], cu: [0.7, 1.1, -0.4, 0.3], cu1: [0.7], cu3: [0.7, 1.1, -0.4],
  rxx: [0.7], ryy: [1.1], rzz: [-0.4], rzx: [0.9], xx_plus_yy: [0.7, 1.1], xx_minus_yy: [0.7, 1.1],
  fsim: [0.7, 1.1], ms: [0.4, 0.9, 1.3], mcp: [0.7], mcu: [0.7, 1.1, -0.4],
};

/** Harness: collect checks into named groups, turning throws into failures. */
class Suite {
  groups: CheckGroup[] = [];
  private cur: CheckGroup | null = null;
  group(name: string) { this.cur = { name, checks: [] }; this.groups.push(this.cur); }
  check(name: string, fn: () => boolean, detailOnFail = "") {
    let passed = false, detail = detailOnFail;
    try { passed = fn(); } catch (e) { passed = false; detail = e instanceof Error ? e.message : String(e); }
    this.cur!.checks.push({ name, passed, detail: passed ? undefined : detail });
  }
}

export function runSelfTest(): SelfTestReport {
  const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const s = new Suite();

  // ── Gate matrices ──────────────────────────────────────────────────
  s.group("Gate matrices");
  {
    let unit = 0, tot = 0;
    for (const g of GATES) {
      const nc = g.variableControls ? 2 : g.numControls;
      const m = buildMatrix(g.id, GATE_PARAMS[g.id] ?? [], nc || undefined);
      if (!m) continue;
      tot++;
      if (isUnitary(m)) unit++;
    }
    s.check(`Every gate matrix is unitary (${unit}/${tot})`, () => unit === tot && tot > 50, `${unit}/${tot}`);
    const X = buildMatrix("x", [])!, Z = buildMatrix("z", [])!, H = buildMatrix("h", [])!;
    const S = buildMatrix("s", [])!, T = buildMatrix("t", [])!, I2 = buildMatrix("i", [])!;
    s.check("X² = I", () => matEq(matmul(X, X), I2));
    s.check("H² = I", () => matEq(matmul(H, H), I2));
    s.check("S² = Z", () => matEq(matmul(S, S), Z));
    s.check("T² = S", () => matEq(matmul(T, T), S));
    s.check("H·X·H = Z", () => matEq(matmul(matmul(H, X), H), Z));
    s.check("H·Z·H = X", () => matEq(matmul(matmul(H, Z), H), X));
  }

  // ── Statevector simulator ──────────────────────────────────────────
  s.group("Statevector simulator");
  {
    s.check("X flips |0⟩ → |1⟩", () => close(probOf(simulate(circ(1, [gate("x", [0])]), {}), "1"), 1));
    s.check("H makes a uniform superposition", () => {
      const r = simulate(circ(1, [gate("h", [0])]), {});
      return close(probOf(r, "0"), 0.5) && close(probOf(r, "1"), 0.5);
    });
    s.check("Bell state = (|00⟩+|11⟩)/√2", () => {
      const r = simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {});
      return close(probOf(r, "00"), 0.5) && close(probOf(r, "11"), 0.5) && close(probOf(r, "01"), 0) && close(probOf(r, "10"), 0);
    });
    s.check("3-qubit GHZ", () => {
      const r = simulate(circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("cx", [2], [1])]), {});
      return close(probOf(r, "000"), 0.5) && close(probOf(r, "111"), 0.5);
    });
    s.check("Big-endian: X on qubit 0 → |100⟩", () => close(probOf(simulate(circ(3, [gate("x", [0])]), {}), "100"), 1));
    s.check("RX(π) ≈ X: |0⟩ → |1⟩", () => close(probOf(simulate(circ(1, [gate("rx", [0], [], ["pi"])]), {}), "1"), 1));
    s.check("Probabilities sum to 1", () => {
      const r = simulate(circ(3, [gate("h", [0]), gate("ry", [1], [], ["0.7"]), gate("cx", [2], [0]), gate("t", [1])]), {});
      return close(r.probabilities.reduce((a, b) => a + b, 0), 1);
    });
    s.check("Bloch vector of |+⟩ points +X", () => {
      const b = simulate(circ(1, [gate("h", [0])]), {}).blochVectors[0];
      return close(b.x, 1) && close(b.z, 0);
    });
  }

  // ── Stabilizer (Clifford tableau) ──────────────────────────────────
  s.group("Stabilizer tableau");
  {
    const g = (id: string, t: number[], c: number[] = [], cl: number[] = []) => ({ gateId: id, targets: t, controls: c, clbits: cl });
    s.check("Bell outcomes perfectly correlated", () => {
      for (let seed = 0; seed < 20; seed++) {
        const { classical } = runClifford(2, [g("h", [0]), g("cx", [1], [0]), g("measure", [0], [], [0]), g("measure", [1], [], [1])], mulberry32(seed + 1), 2);
        if (classical[0] !== classical[1]) return false;
      }
      return true;
    });
    s.check("GHZ: all qubits measure equal", () => {
      const gates = [g("h", [0]), g("cx", [1], [0]), g("cx", [2], [1]), g("measure", [0], [], [0]), g("measure", [1], [], [1]), g("measure", [2], [], [2])];
      for (let seed = 0; seed < 20; seed++) {
        const { classical } = runClifford(3, gates, mulberry32(seed + 1), 3);
        if (classical[0] !== classical[1] || classical[1] !== classical[2]) return false;
      }
      return true;
    });
    s.check("40-qubit GHZ runs via the tableau", () => {
      const gates = [g("h", [0])];
      for (let q = 1; q < 40; q++) gates.push(g("cx", [q], [q - 1]));
      for (let q = 0; q < 40; q++) gates.push(g("measure", [q], [], [q]));
      const { classical } = runClifford(40, gates, mulberry32(7), 40);
      const all0 = [...classical].every((b) => b === classical[0]);
      return all0;
    });
  }

  // ── Pauli expectations ─────────────────────────────────────────────
  s.group("Pauli expectations");
  {
    s.check("⟨Z⟩ = +1 on |0⟩", () => close(paulis(simulate(circ(1, []), {}).state, 1, P("Z")), 1));
    s.check("⟨Z⟩ = −1 on |1⟩", () => close(paulis(simulate(circ(1, [gate("x", [0])]), {}).state, 1, P("Z")), -1));
    s.check("⟨X⟩ = +1 on |+⟩", () => close(paulis(simulate(circ(1, [gate("h", [0])]), {}).state, 1, P("X")), 1));
    s.check("Bell ⟨ZZ⟩ = ⟨XX⟩ = +1", () => {
      const st = simulate(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), {}).state;
      return close(paulis(st, 2, P("ZZ")), 1) && close(paulis(st, 2, P("XX")), 1);
    });
  }

  // ── OpenQASM round-trip ────────────────────────────────────────────
  s.group("OpenQASM 3 round-trip");
  {
    const rt = (c: Circuit) => {
      const r = parseQasm3(emitQasm3(c));
      if (!r.ok) return false;
      return equivalenceCheck(c, r.circuit, [], [], {}).equivalent;
    };
    s.check("Bell round-trips", () => rt(circ(2, [gate("h", [0]), gate("cx", [1], [0])])));
    s.check("GHZ + Toffoli round-trips", () => rt(circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("ccx", [2], [0, 1])])));
    s.check("Rotations round-trip", () => rt(circ(2, [gate("rx", [0], [], ["pi/2"]), gate("ry", [1], [], ["0.7"]), gate("rzz", [1], [0], ["1.3"])])));
    s.check("Emit is idempotent", () => {
      const c = circ(2, [gate("h", [0]), gate("cx", [1], [0]), gate("rz", [1], [], ["pi/4"])]);
      const once = emitQasm3(c);
      const r = parseQasm3(once);
      return r.ok && emitQasm3(r.circuit) === once;
    });
  }

  // ── Equivalence checker ────────────────────────────────────────────
  s.group("Equivalence checker");
  {
    const eq = (a: Circuit, b: Circuit) => equivalenceCheck(a, b, [], [], {}).equivalent;
    s.check("A circuit equals itself", () => eq(circ(2, [gate("h", [0]), gate("cx", [1], [0])]), circ(2, [gate("h", [0]), gate("cx", [1], [0])])));
    s.check("H·H = I", () => eq(circ(1, [gate("h", [0], [], [], 0), gate("h", [0], [], [], 1)]), circ(1, [gate("i", [0])])));
    s.check("Two CNOTs cancel", () => eq(circ(2, [gate("cx", [1], [0], [], 0), gate("cx", [1], [0], [], 1)]), circ(2, [])));
    s.check("X and Z are NOT equivalent", () => !eq(circ(1, [gate("x", [0])]), circ(1, [gate("z", [0])])));
  }

  // ── SDK code exports ───────────────────────────────────────────────
  s.group("SDK code exports");
  {
    const sample = circ(3, [gate("h", [0]), gate("rz", [1], [], ["pi/4"]), gate("cx", [1], [0]), gate("ccx", [2], [0, 1])]);
    const emitters: Array<[string, (c: Circuit) => string, RegExp]> = [
      ["Qiskit", emitQiskit, /QuantumCircuit/],
      ["Cirq", emitCirq, /cirq/],
      ["Braket", emitBraket, /Circuit/],
      ["Q#", emitQSharp, /operation/],
      ["PyQuil", emitPyQuil, /Program/],
      ["pytket", emitPytket, /Circuit/],
      ["OpenQASM 2", emitQasm2, /OPENQASM 2/],
      ["quantikz (LaTeX)", emitQuantikz, /\\/],
    ];
    for (const [name, fn, sig] of emitters) {
      s.check(`${name} export`, () => { const out = fn(sample); return out.length > 20 && sig.test(out); });
    }
  }

  // ── Transpiler ─────────────────────────────────────────────────────
  s.group("Transpiler");
  {
    const rot = circ(2, [gate("h", [0]), gate("ry", [1], [], ["0.7"]), gate("cx", [1], [0]), gate("rz", [0], [], ["pi/3"])]);
    const cliffT = circ(3, [gate("h", [0]), gate("cx", [1], [0]), gate("t", [1]), gate("ccx", [2], [0, 1])]);
    s.check("IBM heavy-hex preserves the unitary", () => equivalenceCheck(rot, transpile(rot, "ibm-heavy-hex").circuit, [], [], {}).equivalent);
    s.check("Rigetti preserves the unitary", () => equivalenceCheck(rot, transpile(rot, "rigetti").circuit, [], [], {}).equivalent);
    s.check("Clifford+T Toffoli decomposition is equivalent", () => equivalenceCheck(cliffT, transpile(cliffT, "clifford-t").circuit, [], [], {}).equivalent);
  }

  // ── Trotter synthesis ──────────────────────────────────────────────
  s.group("Trotter synthesis");
  {
    s.check("e^{-iδX} on |0⟩ = RX(2δ)", () => {
      const c = buildTrotterCircuit(parsePauliSum("1.0 X"), { steps: 1, delta: "t" });
      return close(probOf(simulate(c, { t: Math.PI / 4 }), "1"), 0.5);
    });
    s.check("Z-only Hamiltonian preserves populations", () => {
      const c = buildTrotterCircuit(parsePauliSum("1.0 Z"), { steps: 2, delta: "t" });
      return close(probOf(simulate(c, { t: 0.6 }), "0"), 1);
    });
  }

  // ── Inverse & resources ────────────────────────────────────────────
  s.group("Inverse & resources");
  {
    s.check("T† inverts T", () => invertGate(gate("t", [0]))?.gateId === "tdg");
    s.check("RX(θ)† negates the angle", () => invertGate(gate("rx", [0], [], ["0.7"]))?.params[0] === "-(0.7)");
    s.check("iSWAP is correctly refused (not self-inverse)", () => invertGate(gate("iswap", [0, 1])) === null);
    s.check("Resource counts (T-count, CX, depth)", () => {
      const r = estimateResources(circ(2, [gate("cx", [1], [0]), gate("t", [0], [], [], 1), gate("h", [0], [], [], 2)]));
      return r.tCount === 1 && r.cxCount === 1 && r.totalGates === 3;
    });
  }

  let passed = 0, failed = 0;
  for (const g of s.groups) for (const c of g.checks) (c.passed ? passed++ : failed++);
  const t1 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  return { groups: s.groups, passed, failed, total: passed + failed, durationMs: t1 - t0 };
}
