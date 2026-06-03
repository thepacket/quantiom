// Verification for the Rigetti transpile target. Run with
// `npx tsx scripts/test-rigetti.ts` from the client/ directory.

import { simulate } from "../src/sim/simulate";
import { transpile } from "../src/sim/transpile";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";

let idc = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = []): PlacedGate {
  return {
    id: `g${idc++}`,
    gateId: gateId as GateId,
    column: 0,
    controls,
    targets,
    clbits: [],
    params,
  };
}

// Build the 2^n × 2^n unitary of a circuit by simulating each basis input.
function unitary(circuit: Circuit): { re: number; im: number }[][] {
  const n = circuit.numQubits;
  const dim = 1 << n;
  const U: { re: number; im: number }[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => ({ re: 0, im: 0 })),
  );
  for (let j = 0; j < dim; j++) {
    // Prepend X gates to prepare basis state |j> (big-endian: qubit 0 = MSB).
    const prep: PlacedGate[] = [];
    let col = 0;
    for (let q = 0; q < n; q++) {
      const bit = (j >> (n - 1 - q)) & 1;
      if (bit) prep.push({ ...gate("x", [q]), column: col });
    }
    col = 1;
    const shifted = circuit.gates.map((g) => ({ ...g, column: g.column + 1 }));
    const c: Circuit = { ...circuit, gates: [...prep, ...shifted] };
    const res = simulate(c, {}, []);
    for (let i = 0; i < dim; i++) {
      U[i][j] = { re: res.state[2 * i], im: res.state[2 * i + 1] };
    }
  }
  return U;
}

// Distance between two unitaries after factoring out global phase: align the
// largest-magnitude entry of A to B's, then take max element-wise difference.
function distance(A: { re: number; im: number }[][], B: { re: number; im: number }[][]): number {
  const dim = A.length;
  // Find largest-magnitude entry in A.
  let bi = 0, bj = 0, bmag = -1;
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      const m = A[i][j].re ** 2 + A[i][j].im ** 2;
      if (m > bmag) { bmag = m; bi = i; bj = j; }
    }
  // phase = B / A at that entry
  const a = A[bi][bj], b = B[bi][bj];
  const aMag = Math.hypot(a.re, a.im);
  // phase factor p such that p * a ≈ b  ⇒ compare p*A with B
  const p = { re: (b.re * a.re + b.im * a.im) / (aMag * aMag), im: (b.im * a.re - b.re * a.im) / (aMag * aMag) };
  let maxd = 0;
  for (let i = 0; i < dim; i++)
    for (let j = 0; j < dim; j++) {
      const pa = { re: p.re * A[i][j].re - p.im * A[i][j].im, im: p.re * A[i][j].im + p.im * A[i][j].re };
      const d = Math.hypot(pa.re - B[i][j].re, pa.im - B[i][j].im);
      if (d > maxd) maxd = d;
    }
  return maxd;
}

const NATIVE = new Set(["i", "rz", "rx", "cz"]);

function checkNative(gates: PlacedGate[]): string | null {
  for (const g of gates) {
    if (!NATIVE.has(g.gateId)) return `non-native gate ${g.gateId}`;
    if (g.gateId === "rx") {
      const p = g.params[0];
      if (p !== "π/2" && p !== "-π/2") {
        // tolerate numeric-equivalent strings
        return `rx with non-±π/2 angle: ${p}`;
      }
    }
  }
  return null;
}

type Case = { name: string; n: number; gate: PlacedGate };
const cases: Case[] = [
  { name: "rx(0.9)", n: 1, gate: gate("rx", [0], [], ["0.9"]) },
  { name: "rx(-2.3)", n: 1, gate: gate("rx", [0], [], ["-2.3"]) },
  { name: "ry(0.7)", n: 1, gate: gate("ry", [0], [], ["0.7"]) },
  { name: "ry(1.9)", n: 1, gate: gate("ry", [0], [], ["1.9"]) },
  { name: "rx(π/2)", n: 1, gate: gate("rx", [0], [], ["π/2"]) },
  { name: "h", n: 1, gate: gate("h", [0]) },
  { name: "x", n: 1, gate: gate("x", [0]) },
  { name: "u3(0.4,1.1,-0.6)", n: 1, gate: gate("u3", [0], [], ["0.4", "1.1", "-0.6"]) },
  { name: "cx", n: 2, gate: gate("cx", [1], [0]) },
  { name: "cz", n: 2, gate: gate("cz", [1], [0]) },
  { name: "iswap", n: 2, gate: gate("iswap", [0, 1]) },
  { name: "dcx", n: 2, gate: gate("dcx", [0, 1]) },
  { name: "ecr", n: 2, gate: gate("ecr", [0, 1]) },
  { name: "rxx(0.8)", n: 2, gate: gate("rxx", [0, 1], [], ["0.8"]) },
  { name: "ryy(1.3)", n: 2, gate: gate("ryy", [0, 1], [], ["1.3"]) },
  { name: "rzz(0.5)", n: 2, gate: gate("rzz", [0, 1], [], ["0.5"]) },
  { name: "u_arb_2 (Haar)", n: 2, gate: gate("u_arb_2", [0, 1], [], haarParams()) },
];

// Generate a Haar-random 4×4 unitary's params for u_arb_2 if it takes a matrix
// param. Fallback: a fixed entangling unitary string list. We instead build it
// from a known parametrization the gate accepts.
function haarParams(): string[] {
  // u_arb_2 expects 32 numbers (4×4 complex re,im). Build via QR of a random
  // complex matrix with a fixed seed.
  let s = 12345 >>> 0;
  const rand = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const N = 4;
  // random complex matrix
  const A: { re: number; im: number }[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ re: gauss(), im: gauss() })));
  // Gram-Schmidt to orthonormalize columns → unitary
  const cols: { re: number; im: number }[][] = Array.from({ length: N }, (_, j) => A.map((row) => ({ ...row[j] })));
  const dot = (u: any[], v: any[]) => u.reduce((acc, x, i) => ({ re: acc.re + x.re * v[i].re + x.im * v[i].im, im: acc.im + x.re * v[i].im - x.im * v[i].re }), { re: 0, im: 0 });
  for (let j = 0; j < N; j++) {
    for (let k = 0; k < j; k++) {
      const c = dot(cols[k], cols[j]);
      for (let i = 0; i < N; i++) {
        cols[j][i].re -= c.re * cols[k][i].re - c.im * cols[k][i].im;
        cols[j][i].im -= c.re * cols[k][i].im + c.im * cols[k][i].re;
      }
    }
    const norm = Math.sqrt(cols[j].reduce((a, x) => a + x.re * x.re + x.im * x.im, 0));
    for (let i = 0; i < N; i++) { cols[j][i].re /= norm; cols[j][i].im /= norm; }
  }
  // reassemble row-major re,im list
  const out: string[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { out.push(String(cols[j][i].re)); out.push(String(cols[j][i].im)); }
  return out;
}

let pass = 0, fail = 0;
for (const c of cases) {
  const orig: Circuit = { numQubits: c.n, numClbits: 0, gates: [c.gate] };
  let tr;
  try { tr = transpile(orig, "rigetti"); } catch (e) { console.log(`✗ ${c.name}: transpile threw ${e}`); fail++; continue; }
  if (tr.skipped.length) { console.log(`✗ ${c.name}: skipped ${JSON.stringify(tr.skipped)}`); fail++; continue; }
  const nativeErr = checkNative(tr.circuit.gates);
  const Uo = unitary(orig);
  const Ut = unitary(tr.circuit);
  const d = distance(Uo, Ut);
  const ok = d < 1e-6 && !nativeErr;
  console.log(`${ok ? "✓" : "✗"} ${c.name}: dist=${d.toExponential(2)} gates=${tr.circuit.gates.length}${nativeErr ? "  NATIVE-ERR: " + nativeErr : ""}`);
  if (ok) pass++; else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
