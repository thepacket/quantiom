OPENQASM 3.0;
include "stdgates.inc";

qubit[2] q;
bit[1] c;

// Repeat-Until-Success (RUS) circuit — a small protocol that
// probabilistically synthesises an exotic single-qubit unitary using
// only Clifford+T resources, with classical feedback on the outcome.
//
// Motivation: some target unitaries (e.g. exact V₃ = (I + 2iZ)/√5)
// don't have ANY exact decomposition over Clifford+T. They admit
// probabilistic decompositions: with probability p the protocol
// succeeds and applies the desired gate; with probability 1−p you
// have to re-run.
//
// Template:
//   1. Try a non-deterministic state prep on data + ancilla.
//   2. Measure the ancilla. Outcome 0 = success, the data qubit now
//      holds the target unitary applied to its input.
//   3. Outcome 1 = failure, apply a known correction gate and retry
//      (in a real RUS protocol, this branch loops; here the
//      conditional gate captures the correction without an explicit
//      while-loop).
//
// This is the simplest non-trivial DYNAMIC circuit in Quantiom: the
// classically-conditioned X and T on q[0] only fire on the failure
// branch, so the simulation actually splits trajectories. Open the
// Measurement Counts panel after loading and you'll see two distinct
// outcomes with their probabilities.
//
// Reference: Paetznick, Svore (2014), "Repeat-until-success: non-
// deterministic decomposition of single-qubit unitaries".

// Attempt: H on data, controlled rotation on ancilla, T on data.
h q[0];
ch q[0], q[1];
t q[0];

// Measure ancilla.
c[0] = measure q[1];

// On failure (c[0] == 1), apply the recovery on the data qubit.
if (c[0] == 1) x q[0];
if (c[0] == 1) t q[0];
