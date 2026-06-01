// Entanglement swapping. Two independently prepared Bell pairs share no
// entanglement to begin with:
//
//   q[0] ─┐                    q[2] ─┐
//         ├── Bell pair              ├── Bell pair
//   q[1] ─┘                    q[3] ─┘
//
// A Bell measurement on the middle pair (q[1], q[2]) projects q[0] and
// q[3] into a Bell state of their own — even though those qubits never
// interacted directly. The two classical bits steer X / Z corrections on
// q[3] to land on the canonical |Φ+⟩.
//
// The if-conditioned gates use OpenQASM 3 classical control; if your
// downstream tool doesn't support them, drop those two lines and inspect
// the post-measurement state directly.

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;
bit[2] c;

// Prepare two Bell pairs.
h q[0];
cx q[0], q[1];
h q[2];
cx q[2], q[3];

// Bell measurement on (q[1], q[2]).
cx q[1], q[2];
h q[1];
c[0] = measure q[1];
c[1] = measure q[2];

// Conditional corrections so q[0]–q[3] end on |Φ+⟩.
if (c[1] == 1) x q[3];
if (c[0] == 1) z q[3];
