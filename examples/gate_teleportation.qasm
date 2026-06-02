// Gate teleportation — apply a gate to a logical qubit by consuming
// a pre-prepared resource state plus a Bell measurement plus classical
// feedback. The MBQC primitive that underlies all measurement-based
// quantum computing.
//
// Example: implement the T gate on q[0] without actually applying T to
// it directly. Consume the magic resource |T⟩ = T|+⟩ on q[1] via a CX
// and a measurement.
//
// Protocol:
//   1. Prepare the resource state |T⟩ on q[1]:  H · T |0⟩.
//   2. Entangle q[0] with q[1] via CX(0, 1).
//   3. Measure q[0] in the Z basis → classical bit m.
//   4. If m = 1, apply an S correction on q[1] (which now holds the
//      T-transformed input state).
//
// This is the building block of fault-tolerant non-Clifford gates:
// magic-state distillation produces high-fidelity |T⟩, gate
// teleportation consumes one per logical T gate.

OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[1] m;

// Input state on q[0] — here we use a deliberate |+⟩ so the effect is
// visible (after the protocol, q[1] should hold T|+⟩).
h q[0];

// Resource state |T⟩ = T|+⟩ on q[1].
h q[1];
t q[1];

// Bell-measurement-style entanglement + correction.
cx q[0], q[1];
m[0] = measure q[0];
if (m[0] == 1) s q[1];
