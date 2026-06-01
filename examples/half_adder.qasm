// Reversible quantum half-adder. Inputs in q[0] and q[1]; sum lands in q[2]
// and carry in q[3]. After execution:
//
//   q[2] = q[0] ⊕ q[1]      (sum)
//   q[3] = q[0] · q[1]      (carry)
//
// Try toggling X gates on q[0] / q[1] before the adder to set the inputs
// to 0+0, 0+1, 1+0, or 1+1, then check that (q[3], q[2]) reads back the
// expected 2-bit number.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[4] c;

// Example inputs: 1 + 1.
x q[0];
x q[1];

// Sum = a XOR b.
cx q[0], q[2];
cx q[1], q[2];

// Carry = a AND b.
ccx q[0], q[1], q[3];

c[0] = measure q[0];
c[1] = measure q[1];
c[2] = measure q[2];
c[3] = measure q[3];
