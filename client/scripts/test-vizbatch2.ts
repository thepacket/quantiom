// Verification for the phase-space / magic / entanglement visualiser batch.
// Run with `npx tsx scripts/test-vizbatch2.ts` from client/.

import { simulate } from "../src/sim/simulate";
import { allPauliExpectations } from "../src/sim/pauliSpectrum";
import { magic } from "../src/sim/magic";
import { discreteWigner } from "../src/sim/wigner";
import { negativityMatrix } from "../src/sim/negativity";
import { loschmidtEcho } from "../src/sim/loschmidt";
import type { Circuit, PlacedGate, GateId } from "../src/editor/types";

let idc = 0;
function gate(gateId: string, targets: number[], controls: number[] = [], params: string[] = [], column = 0): PlacedGate {
  return { id: `g${idc++}`, gateId: gateId as GateId, column, controls, targets, clbits: [], params };
}
function circ(numQubits: number, gates: PlacedGate[]): Circuit {
  return { numQubits, numClbits: 0, gates };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ── Magic M₂ ───────────────────────────────────────────────────────────
{
  // |0⟩: stabilizer → M₂ = 0.
  const z = simulate(circ(1, [gate("i", [0])]), {}, []);
  check("M₂(|0⟩) = 0", approx(magic(allPauliExpectations(z.state, 1), 1).m2, 0));

  // |+⟩ (H): stabilizer → M₂ = 0.
  const plus = simulate(circ(1, [gate("h", [0])]), {}, []);
  check("M₂(|+⟩) = 0", approx(magic(allPauliExpectations(plus.state, 1), 1).m2, 0));

  // Bell state: stabilizer → M₂ = 0.
  const bell = simulate(circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]), {}, []);
  check("M₂(Bell) = 0", approx(magic(allPauliExpectations(bell.state, 2), 2).m2, 0));

  // T|+⟩ magic state: M₂ > 0. Known value for the single-qubit T-state:
  // ⟨X⟩=⟨Y⟩=1/√2, ⟨Z⟩=0 → Σ⟨P⟩⁴ = 1 + 1/4 + 1/4 + 0 = 1.5;
  // M₂ = −log₂(1.5/4) − 1 = −log₂(0.375) − 1 = 1.415 − 1 = 0.415 bit.
  const tplus = simulate(circ(1, [gate("h", [0], [], [], 0), gate("t", [0], [], [], 1)]), {}, []);
  const m = magic(allPauliExpectations(tplus.state, 1), 1);
  check("M₂(T|+⟩) ≈ 0.4150", approx(m.m2, -Math.log2(0.375) - 1, 1e-6), `${m.m2}`);
  check("M₂(T|+⟩) > 0", m.m2 > 0.4);
}

// ── Discrete Wigner ─────────────────────────────────────────────────────
{
  // |0⟩: non-negative (stabilizer), W sums to 1.
  const z = simulate(circ(1, [gate("i", [0])]), {}, []);
  const wz = discreteWigner(z.state, 1)!;
  const sum = wz.W.flat().reduce((a, b) => a + b, 0);
  check("W(|0⟩) sums to 1", approx(sum, 1));
  check("W(|0⟩) non-negative", approx(wz.negativity, 0), `neg=${wz.negativity}`);

  // T|+⟩: should be negative somewhere (non-classical).
  const tplus = simulate(circ(1, [gate("h", [0], [], [], 0), gate("t", [0], [], [], 1)]), {}, []);
  const wt = discreteWigner(tplus.state, 1)!;
  check("W(T|+⟩) has negativity", wt.negativity > 1e-3, `neg=${wt.negativity}`);
  check("W(T|+⟩) sums to 1", approx(wt.W.flat().reduce((a, b) => a + b, 0), 1));
}

// ── Negativity matrix ────────────────────────────────────────────────────
{
  // Bell pair: E_N = 1 ebit.
  const bell = simulate(circ(2, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1)]), {}, []);
  const nb = negativityMatrix(bell.state, 2)!;
  check("E_N(Bell) ≈ 1", approx(nb.neg[0][1], 1, 1e-6), `${nb.neg[0][1]}`);

  // 3-qubit GHZ: pairwise negativity = 0 (entanglement is global, not pairwise),
  // even though pairwise mutual information is non-zero.
  const ghz = simulate(circ(3, [gate("h", [0], [], [], 0), gate("cx", [1], [0], [], 1), gate("cx", [2], [1], [], 2)]), {}, []);
  const ng = negativityMatrix(ghz.state, 3)!;
  check("E_N(GHZ pairs) ≈ 0", approx(ng.neg[0][1], 0, 1e-6) && approx(ng.neg[0][2], 0, 1e-6) && approx(ng.neg[1][2], 0, 1e-6),
    `${ng.neg[0][1]}, ${ng.neg[0][2]}, ${ng.neg[1][2]}`);

  // Product state: E_N = 0.
  const prod = simulate(circ(2, [gate("h", [0]), gate("x", [1])]), {}, []);
  check("E_N(product) ≈ 0", approx(negativityMatrix(prod.state, 2)!.neg[0][1], 0, 1e-9));
}

// ── Loschmidt echo ───────────────────────────────────────────────────────
{
  // rx(t) on 1 qubit: |ψ(t)⟩ = cos(t/2)|0⟩ − i sin(t/2)|1⟩.
  // L(t) = |⟨ψ0|ψt⟩|² = cos²(t/2). At t=0: L=1; at t=2π (k=last): cos²(π)=1.
  const c = circ(1, [gate("rx", [0], [], ["t"], 0)]);
  const le = loschmidtEcho(c, {}, [], 97)!;
  check("L(0) = 1", approx(le.L[0], 1, 1e-9));
  // midpoint k where t≈π → cos²(π/2)=0
  const kPi = Math.round((96) / 2); // t = 2π·48/96 = π
  check("L(π) ≈ 0 (echo collapse)", approx(le.L[kPi], 0, 1e-6), `${le.L[kPi]}`);
  // sample t=2π/3 → cos²(π/3)=0.25
  const kThird = Math.round(96 / 3);
  const tThird = (2 * Math.PI * kThird) / 96;
  check("L(t) = cos²(t/2)", approx(le.L[kThird], Math.cos(tThird / 2) ** 2, 1e-6), `${le.L[kThird]}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
