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
| [animated_rabi_larmor.qasm](animated_rabi_larmor.qasm) | 2 | Uses the special `t` symbol; hit ▶ on the Parameters panel |
| [quantum_coin_flip.qasm](quantum_coin_flip.qasm) | 1 | The simplest non-trivial circuit |
| [hadamard_transform_3q.qasm](hadamard_transform_3q.qasm) | 3 | H⊗H⊗H — the uniform superposition |
| [superdense_coding.qasm](superdense_coding.qasm) | 2 | 2 classical bits over 1 qubit using shared entanglement |
| [chsh_test.qasm](chsh_test.qasm) | 2 | Bell inequality with parameterized measurement angles |
| [inverse_qft_3q.qasm](inverse_qft_3q.qasm) | 3 | Companion to the QFT example |
| [quantum_phase_estimation.qasm](quantum_phase_estimation.qasm) | 4 | QPE for T gate; exact answer with 3 counting qubits |
| [half_adder.qasm](half_adder.qasm) | 4 | Reversible quantum half adder |
| [bit_flip_code.qasm](bit_flip_code.qasm) | 3 | 3-qubit repetition code + majority-vote decoder |
| [qaoa_maxcut_triangle.qasm](qaoa_maxcut_triangle.qasm) | 3 | QAOA on K₃ with γ, β parameters |
| [cluster_state_4q.qasm](cluster_state_4q.qasm) | 4 | Linear cluster — the MBQC resource |
| [magic_state.qasm](magic_state.qasm) | 1 | T|+⟩ — the resource for fault-tolerant non-Clifford gates |
| [grover_3q.qasm](grover_3q.qasm) | 3 | Grover with 2 iterations, peak success ≈ 94.5% |
| [toffoli_decomposition.qasm](toffoli_decomposition.qasm) | 3 | CCX → CNOTs + T/T† + H |
| [entanglement_swap.qasm](entanglement_swap.qasm) | 4 | Bell measurement entangles two pairs that never interacted |
| [bb84_round.qasm](bb84_round.qasm) | 1 | One round of BB84 with parameterized basis angles |
| [draper_adder.qasm](draper_adder.qasm) | 2 | Fourier-basis addition of a classical constant |
| [quantum_walk_step.qasm](quantum_walk_step.qasm) | 3 | One step of a coined walk on the 4-cycle |
| [deutsch_1bit.qasm](deutsch_1bit.qasm) | 2 | Deutsch's original constant-vs-balanced algorithm |
| [simon_2bit.qasm](simon_2bit.qasm) | 4 | Simon's algorithm with hidden string s = 11 |
| [schrodinger_cat_phase.qasm](schrodinger_cat_phase.qasm) | 3 | Phased cat state with a φ slider |
| [cuccaro_adder_2bit.qasm](cuccaro_adder_2bit.qasm) | 6 | Cuccaro ripple-carry adder, 2-bit + 2-bit |
| [steane_encode_logical_zero.qasm](steane_encode_logical_zero.qasm) | 7 | Steane [[7,1,3]] encoder for the logical \|0⟩ |
| [sono_octave.qasm](sono_octave.qasm) | 1 | Sonorizer demo: pure octave |
| [sono_tremolo.qasm](sono_tremolo.qasm) | 1 | Sonorizer demo: amplitude tremolo via RY(t) |
| [sono_phase_slide.qasm](sono_phase_slide.qasm) | 1 | Sonorizer demo: animated phase via RZ(t) |
| [sono_bell_chord.qasm](sono_bell_chord.qasm) | 2 | Sonorizer demo: fundamental + 2-octave-up partial |
| [sono_sawtooth.qasm](sono_sawtooth.qasm) | 4 | Sonorizer demo: 16 equal partials |
| [anim_qft_state.qasm](anim_qft_state.qasm) | 3 | QFT of an input that evolves with t |
| [anim_phase_fountain.qasm](anim_phase_fountain.qasm) | 4 | Four entangled qubits, four phase rates |
| [anim_ising_trotter.qasm](anim_ising_trotter.qasm) | 4 | Transverse-field Ising dynamics by Trotter |
| [anim_cascade_5q.qasm](anim_cascade_5q.qasm) | 5 | Five qubits, five rotation rates (1,2,3,5,7) |
| [anim_swirl_6q.qasm](anim_swirl_6q.qasm) | 6 | Dense 6-qubit ansatz, ~35 t-parameterized gates |
