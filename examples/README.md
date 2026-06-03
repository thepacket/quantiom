# Examples

93 OpenQASM 3 example circuits across 10 categories. Each file has a
header comment explaining the concept, the technique, and what to
observe in which panel — the same text is rendered as a hover tooltip
when you browse the **Examples…** picker in the app.

For the introductory tour, see
[`docs/tutorial.md`](../docs/tutorial.md), which walks through Bell →
parameters → noise → ZNE → PEC → VQE using six of these examples.

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
| [anim_qft_state.qasm](anim_qft_state.qasm) | 3 | QFT of an input that evolves with t |
| [anim_phase_fountain.qasm](anim_phase_fountain.qasm) | 4 | Four entangled qubits, four phase rates |
| [anim_ising_trotter.qasm](anim_ising_trotter.qasm) | 4 | Transverse-field Ising dynamics by Trotter |
| [anim_cascade_5q.qasm](anim_cascade_5q.qasm) | 5 | Five qubits, five rotation rates (1,2,3,5,7) |
| [anim_swirl_6q.qasm](anim_swirl_6q.qasm) | 6 | Dense 6-qubit ansatz, ~35 t-parameterized gates |
| [swap_test.qasm](swap_test.qasm) | 3 | Overlap \|⟨ψ\|φ⟩\|² via controlled-SWAP and ancilla measurement |
| [hadamard_test.qasm](hadamard_test.qasm) | 2 | Re ⟨ψ\|U\|ψ⟩ — the VQE expectation-estimation workhorse |
| [bell_measurement.qasm](bell_measurement.qasm) | 2 | Project onto the Bell basis (teleportation primitive) |
| [phase_flip_code.qasm](phase_flip_code.qasm) | 3 | 3-qubit code for Z errors — companion to bit-flip |
| [mermin_ghz_test.qasm](mermin_ghz_test.qasm) | 3 | Mermin's GHZ inequality — single-shot nonlocality |
| [iterative_qpe.qasm](iterative_qpe.qasm) | 2 | Kitaev-style 1-ancilla phase estimation |
| [vqe_h2_minimal.qasm](vqe_h2_minimal.qasm) | 2 | Variational ansatz for the H₂ ground state |
| [trotter_heisenberg_2q.qasm](trotter_heisenberg_2q.qasm) | 2 | Heisenberg XXX time evolution, one Trotter step |
| [gate_teleportation.qasm](gate_teleportation.qasm) | 2 | T gate via magic state + Bell measurement |
| [dicke_state_3q.qasm](dicke_state_3q.qasm) | 3 | Symmetric single-excitation state \|D₃¹⟩ |
| [stabilizer_measurement.qasm](stabilizer_measurement.qasm) | 3 | Non-destructive Z⊗Z eigenvalue readout |
| [shor_9q_encoder.qasm](shor_9q_encoder.qasm) | 9 | Original [[9,1,3]] code encoder |
| [quantum_thermometer.qasm](quantum_thermometer.qasm) | 1 | Ramsey interferometry for phase / temperature sensing |
| [no_cloning_witness.qasm](no_cloning_witness.qasm) | 2 | The CX-as-clone failure mode, visualised on Bloch |
| [amplitude_estimation_2q.qasm](amplitude_estimation_2q.qasm) | 2 | Brassard-Høyer-Mosca-Tapp seed, one counting qubit |
| [quantum_random_walk_cycle.qasm](quantum_random_walk_cycle.qasm) | 3 | Coined quantum walk on the 4-node cycle |
| [quantum_fourier_addition_4q.qasm](quantum_fourier_addition_4q.qasm) | 4 | 2-bit Draper addition in the Fourier basis |
| [surface_code_logical_ops.qasm](surface_code_logical_ops.qasm) | 6 | [[4,2,2]] code: a logical X̄ leaves both stabilizer syndromes at 0 |
| [qaoa_3sat_3var.qasm](qaoa_3sat_3var.qasm) | 3 | QAOA for MAX-3-SAT, one round; phase-the-violating-assignment cost |
| [qsp_primer_1q.qasm](qsp_primer_1q.qasm) | 1 | Quantum signal processing: interleaved signal + phase rotations |
| [kicked_ising_floquet_4q.qasm](kicked_ising_floquet_4q.qasm) | 4 | Kicked-Ising Floquet drive, 4 periods (discrete time crystal at g≈π) |
| [ghz_metrology_3q.qasm](ghz_metrology_3q.qasm) | 3 | GHZ Ramsey interferometer — Heisenberg-limited 3φ fringe |
| [shor_period_finding_15.qasm](shor_period_finding_15.qasm) | 7 | Shor period-finding for N=15, a=4; counting register peaks at 0/4 → r=2 |
