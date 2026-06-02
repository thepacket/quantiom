// Deutsch–Jozsa on 5 input bits + 1 ancilla.
//
// Problem: given a black-box function f: {0,1}⁵ → {0,1} promised to be
// either CONSTANT (always 0 or always 1) or BALANCED (returns 0 on
// exactly half the inputs, 1 on the other half), decide which —
// using as few oracle calls as possible.
//
// Classical lower bound: 2⁴ + 1 = 17 queries in the worst case to
// distinguish constant from balanced with certainty (you might see 16
// matching answers and still need one more to rule out balanced).
//
// Quantum (this circuit): exactly ONE oracle call. The trick:
//   1. Hadamard the input register → uniform superposition over
//      all 32 inputs.
//   2. Phase-kickback ancilla in |−⟩ → oracle imprints (−1)^f(x) on
//      each branch.
//   3. Hadamard the input register again — converts the sign pattern
//      into a computational-basis state.
//
// If f is constant, all 32 branches have the same sign, the second
// H block recombines them perfectly back to |0…0⟩, and measurement
// returns 00000 with certainty. If f is balanced, exactly half the
// signs are negative — they destructively interfere on |0…0⟩ and the
// measurement returns ANY string except 00000.
//
// Below the oracle is f(x) = x[0] ⊕ x[2] ⊕ x[4] (balanced), so you'll
// see one of 31 non-zero outcomes on the Probabilities panel.

OPENQASM 3.0;
include "stdgates.inc";

qubit[6] q;
bit[5] c;

x q[5];
h q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

// Balanced oracle: XOR of selected input bits into the ancilla.
cx q[0], q[5];
cx q[2], q[5];
cx q[4], q[5];

h q[0]; h q[1]; h q[2]; h q[3]; h q[4];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
c[4] = measure q[4];
