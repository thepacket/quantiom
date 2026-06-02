// 4-qubit linear cluster state — the canonical resource state for
// measurement-based quantum computation (MBQC).
//
// Preparation: start with |+⟩^⊗4 (Hadamard every qubit), then apply CZ
// between every adjacent pair along a 1-D chain 0–1–2–3.
//
// What's special: in MBQC you DON'T apply gates to compute. Instead,
// you start with a fixed cluster state and run the computation by
// measuring intermediate qubits one by one in adaptively-chosen bases
// (the bases depend on previous outcomes). Arbitrary single-qubit gates
// and CNOTs propagate "down" the chain via measurement and classical
// feedback. The unmeasured tail of the chain holds the output state.
//
// The 4-qubit linear cluster encodes a single logical qubit at the
// rightmost position; the three measurement steps on q[0..2] each apply
// one stage of a single-qubit unitary on the encoded state in q[3].
//
// Open the Bloch panel after loading: every individual qubit's reduced
// state is maximally mixed (Bloch vector at origin), yet the cluster
// state is highly entangled. The entanglement is hidden in correlations,
// not single-qubit observables.
//
// Reference: Raussendorf, Briegel (2001), "A one-way quantum computer".

OPENQASM 3.0;
include "stdgates.inc";

qubit[4] q;

h q[0];
h q[1];
h q[2];
h q[3];

cz q[0], q[1];
cz q[1], q[2];
cz q[2], q[3];
