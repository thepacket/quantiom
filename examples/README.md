# Examples

OpenQASM 3 example circuits. Each file uses `stdgates.inc` and is written to
load cleanly in Quantiom's editor once the QASM → IR parser lands. For now,
you can copy any of these into a QASM-aware tool (qiskit, IBM Quantum
Composer) or read them as a worked-example reference.

| File | Qubits | What it shows |
|---|---|---|
| [bell.qasm](bell.qasm) | 2 | The canonical entangled pair |
| [ghz.qasm](ghz.qasm) | 3 | Three-qubit entanglement |
| [w_state.qasm](w_state.qasm) | 3 | The other genuine 3-qubit entangled class |
| [bernstein_vazirani.qasm](bernstein_vazirani.qasm) | 4 | Hidden-string oracle, parallel queries |
| [deutsch_jozsa.qasm](deutsch_jozsa.qasm) | 4 | Constant-vs-balanced in one query |
| [grover_2q.qasm](grover_2q.qasm) | 2 | Single Grover iteration on the |11⟩ marked state |
| [qft_3q.qasm](qft_3q.qasm) | 3 | Quantum Fourier Transform with controlled phases |
| [teleportation.qasm](teleportation.qasm) | 3 | State transfer via Bell pair + classical feedback |
| [phase_kickback.qasm](phase_kickback.qasm) | 2 | The mechanism behind most quantum speedups |
| [variational_ansatz.qasm](variational_ansatz.qasm) | 4 | Hardware-efficient ansatz with symbolic parameters |
