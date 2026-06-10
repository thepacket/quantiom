/**
 * Curated AI-prompt library for the AI Assistant chat, grouped by category.
 *
 * Every chat message is automatically prefixed with the current circuit as
 * OpenQASM 3 (plus any "+ context" attachments), so these prompts can refer to
 * "this circuit" without the user re-pasting anything. Selecting a prompt drops
 * its `text` into the chat input for review/editing before sending — bracketed
 * `[…]` placeholders are deliberate cues to fill in a specific value first.
 */

export type Prompt = {
  /** Short label shown in the picker. */
  title: string;
  /** The text inserted into the chat input. */
  text: string;
};

export type PromptCategory = {
  name: string;
  prompts: Prompt[];
};

export const PROMPT_LIBRARY: PromptCategory[] = [
  {
    name: "Analyze",
    prompts: [
      {
        title: "Explain this circuit step by step",
        text: "Explain what this circuit does, gate layer by gate layer, and identify the final state in Dirac notation.",
      },
      {
        title: "Identify the algorithm / primitive",
        text: "Identify the quantum algorithm or primitive this circuit implements, if any, and explain how the structure realizes it.",
      },
      {
        title: "Describe the entanglement",
        text: "Describe the entanglement structure of this circuit: which qubits are entangled, how strongly, and what the Schmidt structure across the middle cut looks like.",
      },
      {
        title: "Explain the output distribution",
        text: "What is the output probability distribution in the computational basis? List the dominant basis states and explain why they dominate.",
      },
      {
        title: "Final statevector (symbolic)",
        text: "Compute the final statevector symbolically (in terms of any free parameters) and write it in normalized Dirac notation.",
      },
      {
        title: "Per-qubit Bloch summary",
        text: "Trace the Bloch vector of each qubit through the circuit and summarize the net rotation applied to each.",
      },
      {
        title: "Clifford / T-count check",
        text: "Is this circuit Clifford? If not, list the non-Clifford gates and give the T-count and T-depth.",
      },
      {
        title: "Product state or entangled?",
        text: "Is the output a product state or entangled? If product, factor it qubit by qubit; if entangled, identify which subsystems are entangled.",
      },
      {
        title: "Symmetries & conserved quantities",
        text: "Identify any symmetries or conserved quantities this circuit respects (e.g. excitation/Hamming-weight number, Z₂ parity) and which gates would break them.",
      },
      {
        title: "Causal cone of a qubit",
        text: "Trace the backward causal cone of qubit [q]'s final value: which gates can possibly affect it, and which are irrelevant?",
      },
    ],
  },
  {
    name: "Plot on demand",
    prompts: [
      {
        title: "⟨Z⟩ per qubit (bars)",
        text: "Make a plot of ⟨Z⟩ for each qubit of this circuit as a bar chart.",
      },
      {
        title: "⟨X⟩ per qubit (bars)",
        text: "Plot ⟨X⟩ for every qubit of this circuit as bars.",
      },
      {
        title: "⟨Z⟩ vs circuit depth",
        text: "Plot how ⟨Z⟩ of each qubit evolves versus circuit depth (one line per qubit).",
      },
      {
        title: "⟨X⟩ vs the t clock",
        text: "Plot ⟨X⟩ of each qubit as a function of the t clock over one full period (0…2π).",
      },
      {
        title: "Space–time ⟨Z⟩ heatmap",
        text: "Plot a space–time heatmap of ⟨Z⟩ (qubit on one axis, circuit depth on the other).",
      },
      {
        title: "Probability distribution",
        text: "Plot the computational-basis probability distribution of this circuit's output as a bar chart.",
      },
      {
        title: "|amplitude| per basis state",
        text: "Plot the magnitude of the amplitude for each basis state of this circuit's output.",
      },
      {
        title: "Entanglement-entropy profile",
        text: "Plot the entanglement-entropy profile S(ρ) across every contiguous bipartition cut of this state.",
      },
      {
        title: "Mutual-information heatmap",
        text: "Plot the pairwise mutual-information I(i:j) heatmap for this circuit's output state.",
      },
      {
        title: "Connected ⟨ZᵢZⱼ⟩ heatmap",
        text: "Plot the connected ⟨ZᵢZⱼ⟩−⟨Zᵢ⟩⟨Zⱼ⟩ correlation matrix of this state as a heatmap.",
      },
      {
        title: "⟨Y⟩ vs depth heatmap",
        text: "Plot a heatmap of ⟨Y⟩ for each qubit versus circuit depth.",
      },
      {
        title: "Best plot for this circuit",
        text: "Pick the single most informative quantity to visualise for this circuit and generate a plot for it, then explain in one sentence why you chose it.",
      },
      {
        title: "⟨Y⟩ per qubit (bars)",
        text: "Plot ⟨Y⟩ for each qubit of this circuit as a bar chart.",
      },
      {
        title: "⟨Z⟩ vs the t clock",
        text: "Plot ⟨Z⟩ of each qubit as a function of the t clock over one full period (0…2π) — show the Rabi/Larmor oscillation.",
      },
      {
        title: "⟨X⟩ vs depth heatmap",
        text: "Plot a space–time heatmap of ⟨X⟩ with qubit on one axis and circuit depth on the other.",
      },
      {
        title: "Entanglement front (⟨Z⟩ depth)",
        text: "Plot ⟨Z⟩ per qubit versus circuit depth and use it to point out where the light-cone / entanglement front first reaches each qubit.",
      },
      {
        title: "Probability — line view",
        text: "Plot the computational-basis output probabilities of this circuit as a line chart so I can see the profile across basis states.",
      },
      {
        title: "Magnetisation map",
        text: "Plot the space–time ⟨Z⟩ heatmap (the magnetisation map) and tell me whether you see Floquet period-doubling stripes, a spreading light cone, or flat static rows.",
      },
      {
        title: "Correlation length",
        text: "Plot the connected ⟨ZᵢZⱼ⟩ correlation heatmap and estimate the correlation length from how fast the off-diagonal correlations decay.",
      },
      {
        title: "Compare ⟨X⟩, ⟨Y⟩, ⟨Z⟩",
        text: "Generate three plots — ⟨X⟩, ⟨Y⟩, and ⟨Z⟩ per qubit — and summarise where each qubit's Bloch vector points.",
      },
      {
        title: "Page curve check",
        text: "Plot the entanglement-entropy profile across every cut and tell me whether it traces the symmetric Page arch (volume law) or stays flat (area law).",
      },
      {
        title: "Total vs classical correlation",
        text: "Plot both the mutual-information heatmap and the connected ⟨ZᵢZⱼ⟩ heatmap, then explain where total (quantum + classical) correlation exceeds the purely classical Z-basis correlation.",
      },
      {
        title: "Time-average magnetisation",
        text: "Plot ⟨Z⟩ of each qubit versus the t clock, then describe the time-averaged magnetisation and any qubit that stays frozen.",
      },
      {
        title: "Per-qubit entanglement S(ρ_q)",
        text: "Plot the single-qubit entanglement entropy S(ρ_q) for each qubit as bars — which qubits are most entangled with the rest?",
      },
      {
        title: "Entanglement front S(ρ_q) vs depth",
        text: "Plot a heatmap of the single-qubit entanglement entropy S(ρ_q) versus circuit depth and point out the entanglement-growth front.",
      },
      {
        title: "Log-negativity heatmap",
        text: "Plot the pairwise log-negativity E_N(i:j) heatmap of this state — genuine (distillable) entanglement between each pair.",
      },
      {
        title: "Concurrence heatmap",
        text: "Plot the pairwise concurrence C(i:j) heatmap and comment on what monogamy implies for the strongly-paired qubits.",
      },
      {
        title: "Negativity vs mutual information",
        text: "Plot both the log-negativity and the mutual-information heatmaps, then explain where pairs share classical correlation without genuine entanglement.",
      },
      {
        title: "Mid-cut entropy growth",
        text: "Plot the mid-cut entanglement entropy versus circuit depth and tell me whether it grows linearly (volume law) or saturates (area law).",
      },
      {
        title: "Mid-cut entropy vs t",
        text: "Plot the mid-cut entanglement entropy versus the t clock over one period and describe the entanglement dynamics.",
      },
      {
        title: "Magic M₂ (single value)",
        text: "Compute and plot the stabilizer-Rényi magic M₂ of this state, then say whether it is a stabilizer state (M₂ = 0) and how much non-Clifford resource it carries.",
      },
      {
        title: "Magic M₂ growth vs depth",
        text: "Plot the stabilizer-Rényi magic M₂ versus circuit depth and identify which gates inject the non-stabilizerness.",
      },
      {
        title: "Per-qubit purity",
        text: "Plot the single-qubit purity Tr(ρ_q²) for each qubit — which qubits are pure (1) and which are mixed by entanglement?",
      },
      {
        title: "Per-qubit coherence",
        text: "Plot the l₁ coherence of each qubit as bars and say which qubits carry superposition in the computational basis.",
      },
      {
        title: "Amplitude phases",
        text: "Plot the amplitude phase arg(aᵢ) for each basis state — show the relative phases the circuit imprints.",
      },
      {
        title: "2-Rényi entropy profile",
        text: "Plot the 2-Rényi entanglement entropy S₂ across every contiguous cut and compare its shape to the von Neumann profile.",
      },
      {
        title: "Pauli-weight distribution",
        text: "Plot the Pauli-weight distribution of this state and read off how much weight sits at high Pauli weight (operator spreading / scrambling).",
      },
      {
        title: "XX and YY correlations",
        text: "Plot the connected ⟨XᵢXⱼ⟩ and ⟨YᵢYⱼ⟩ correlation heatmaps and compare them to the ⟨ZᵢZⱼ⟩ pattern — which basis carries the order?",
      },
      {
        title: "Meyer–Wallach entanglement",
        text: "Plot the Meyer–Wallach global entanglement Q versus circuit depth and describe how entanglement builds up across the register.",
      },
      {
        title: "Participation entropy",
        text: "Plot the participation (Shannon) entropy of the output distribution versus circuit depth — is the state localized on a few basis states or spread out?",
      },
      {
        title: "Global l₁ coherence growth",
        text: "Plot the global l₁ coherence versus the t clock and relate its peaks to where the state is most spread across the computational basis.",
      },
    ],
  },
  {
    name: "Custom visuals (code)",
    prompts: [
      {
        title: "Amplitudes on the complex plane",
        text: "Draw a scatter plot of the output amplitudes on the complex plane (Re on x, Im on y), one point per basis state, sized by probability.",
      },
      {
        title: "Polar probability wheel",
        text: "Draw a radial/polar plot of the computational-basis probabilities arranged around a circle, each wedge length proportional to its probability.",
      },
      {
        title: "Amplitude grid coloured by phase",
        text: "Lay the 2ⁿ amplitudes out on a 2-D grid, each cell coloured by phase (hue) and sized/opacity by |amplitude|.",
      },
      {
        title: "Per-qubit Bloch discs",
        text: "Using data.rho1, draw a row of small Bloch discs — one per qubit — showing each qubit's (⟨X⟩, ⟨Z⟩) point inside a unit circle, with radius shrinking as the qubit gets mixed.",
      },
      {
        title: "Mutual-information chord diagram",
        text: "Draw a chord/arc diagram: place the qubits on a circle and connect each pair with a line whose thickness encodes their mutual information (compute it from the amplitudes).",
      },
      {
        title: "Phase histogram (12 sectors)",
        text: "Draw a histogram of the amplitude phases binned into 12 sectors (−π…π), each bar weighted by the total probability in that phase bin.",
      },
      {
        title: "Describe your own visual",
        text: "Create a custom plot that [describe the visual you want] from this circuit's state. Use a sandboxed plotjs program returning a declarative scene.",
      },
    ],
  },
  {
    name: "Create",
    prompts: [
      {
        title: "Bell state",
        text: "Create a Bell state circuit and briefly explain the entanglement it produces. Emit the OpenQASM.",
      },
      {
        title: "n-qubit GHZ state",
        text: "Build an [n]-qubit GHZ state circuit using a ladder of CX gates. Emit the OpenQASM.",
      },
      {
        title: "Quantum Fourier Transform",
        text: "Generate a Quantum Fourier Transform circuit for [n] qubits, with the final qubit-reversal swaps. Emit the OpenQASM.",
      },
      {
        title: "Grover search",
        text: "Create a Grover search circuit over [n] qubits that amplifies the marked basis state [bitstring], with the optimal number of iterations. Emit the OpenQASM.",
      },
      {
        title: "Hardware-efficient ansatz",
        text: "Create a hardware-efficient variational ansatz over [n] qubits: [d] layers of single-qubit RY rotations (symbolic angles) interleaved with a linear chain of CZ entanglers. Emit the OpenQASM.",
      },
      {
        title: "Trotterized TFIM evolution",
        text: "Construct a first-order Trotter circuit for time-evolving the transverse-field Ising model on [n] qubits for [steps] steps. Emit the OpenQASM.",
      },
      {
        title: "QAOA (p=1) for MaxCut",
        text: "Build a p=1 QAOA circuit for MaxCut on the graph with edges [list edges, e.g. (0,1),(1,2),(2,0)], with symbolic γ and β angles. Emit the OpenQASM.",
      },
      {
        title: "Teleportation",
        text: "Build a quantum teleportation circuit with mid-circuit measurement and classical conditioning. Emit the OpenQASM and explain the classical corrections.",
      },
      {
        title: "VQE ansatz + cost (H₂)",
        text: "Build a UCCSD-lite variational ansatz for the H₂ molecule on [n] qubits with symbolic parameters, and state the qubit Hamiltonian (Pauli sum) whose expectation I should minimize. Emit the OpenQASM.",
      },
      {
        title: "Quantum Phase Estimation",
        text: "Construct a Quantum Phase Estimation circuit with [k] counting qubits for a unitary that applies a phase [phase, e.g. 2π/3] to its eigenstate. Emit the OpenQASM.",
      },
      {
        title: "Amplitude estimation",
        text: "Build a quantum amplitude estimation circuit with [k] evaluation qubits for an amplitude-encoding operator A that I'll describe as [describe A]. Emit the OpenQASM.",
      },
      {
        title: "W state",
        text: "Create a circuit preparing the [n]-qubit W state (equal superposition of single-excitation basis states). Emit the OpenQASM.",
      },
      {
        title: "Quantum walk",
        text: "Build a discrete-time quantum walk on a [size]-node cycle for [steps] steps, with a coin qubit. Emit the OpenQASM.",
      },
      {
        title: "Code encoder (Steane / repetition)",
        text: "Build the encoder circuit for the [Steane [[7,1,3]] / 3-qubit repetition] code, mapping one logical qubit into the code space. Emit the OpenQASM.",
      },
      {
        title: "Bernstein–Vazirani",
        text: "Build a Bernstein–Vazirani circuit that recovers the hidden bitstring [bits, e.g. 1011] in a single query on [n] qubits. Emit the OpenQASM.",
      },
      {
        title: "Deutsch–Jozsa",
        text: "Build a Deutsch–Jozsa circuit on [n] qubits for a [constant / balanced] oracle and explain how one shot decides which. Emit the OpenQASM.",
      },
      {
        title: "Cluster / graph state",
        text: "Create a [n]-qubit linear cluster state (H on all qubits, then CZ between neighbours). Emit the OpenQASM.",
      },
      {
        title: "Random circuit",
        text: "Generate a random [n]-qubit circuit of depth [d] from a hardware-native gate set (random single-qubit gates + a brickwork of CZ/CX). Emit the OpenQASM.",
      },
      {
        title: "QFT adder",
        text: "Build a Draper QFT-based adder that adds the constant [a] to an [n]-qubit register. Emit the OpenQASM.",
      },
    ],
  },
  {
    name: "Optimize",
    prompts: [
      {
        title: "Reduce depth & gate count",
        text: "Reduce the depth and gate count of this circuit while keeping it exactly equivalent. Show the optimized OpenQASM and the before/after counts.",
      },
      {
        title: "Minimize T-count",
        text: "Minimize the T-count of this circuit and explain each rewrite you used. Emit the optimized OpenQASM.",
      },
      {
        title: "Cancel & merge gates",
        text: "Cancel self-inverse pairs and merge adjacent same-axis rotations in this circuit. Emit the simplified OpenQASM.",
      },
      {
        title: "Fewer two-qubit gates",
        text: "Rewrite this circuit to use fewer two-qubit gates without changing the unitary. Explain the savings.",
      },
      {
        title: "Optimize then verify",
        text: "Apply peephole optimizations to this circuit, emit the result as OpenQASM, and argue why it is equivalent to the original.",
      },
      {
        title: "Reduce parallel depth",
        text: "Reorder commuting gates to minimize the circuit's parallel (critical-path) depth without changing the unitary. Emit the OpenQASM and report before/after depth.",
      },
      {
        title: "Fuse single-qubit runs",
        text: "Fuse each maximal run of consecutive single-qubit gates on a wire into one U3. Emit the OpenQASM.",
      },
    ],
  },
  {
    name: "Transform",
    prompts: [
      {
        title: "Transpile to {RZ, SX, CX}",
        text: "Rewrite this circuit using only the IBM heavy-hex native gate set {RZ, SX, CX}. Emit the OpenQASM.",
      },
      {
        title: "Decompose multi-qubit gates",
        text: "Decompose every multi-qubit gate in this circuit into one- and two-qubit gates. Emit the OpenQASM.",
      },
      {
        title: "Parameterize the angles",
        text: "Replace the numeric rotation angles in this circuit with symbolic parameters and list the parameters. Emit the OpenQASM.",
      },
      {
        title: "Append the inverse (U†U)",
        text: "Append the inverse of this circuit so the net operation is the identity. Emit the full OpenQASM.",
      },
      {
        title: "Add basis measurements",
        text: "Add a measurement of every qubit in the computational basis at the end of this circuit. Emit the OpenQASM.",
      },
      {
        title: "Change measurement basis",
        text: "Modify this circuit to measure all qubits in the [X / Y] basis instead of Z. Emit the OpenQASM.",
      },
      {
        title: "CZ ↔ CX rewrite",
        text: "Rewrite every CZ as H·CX·H (or every CX as H·CZ·H), then simplify. Emit the OpenQASM.",
      },
      {
        title: "Make it controlled-U",
        text: "Add one control qubit that turns this entire circuit into a controlled-U. Emit the OpenQASM.",
      },
      {
        title: "Permute the qubit order",
        text: "Relabel the qubits according to the permutation [e.g. 0→2,1→0,2→1] and rewrite the circuit accordingly. Emit the OpenQASM.",
      },
    ],
  },
  {
    name: "Explain & derive",
    prompts: [
      {
        title: "Derive the unitary",
        text: "Derive the overall unitary matrix of this circuit and show the key steps of the calculation.",
      },
      {
        title: "Why this entanglement?",
        text: "Walk me through, with the math, why this circuit produces the entanglement it does.",
      },
      {
        title: "Explain a gate",
        text: "Explain what the [gate, e.g. √Y / fSim / ECR] gate does: its matrix, Bloch-sphere action, and when it is useful.",
      },
      {
        title: "Compare the gates used",
        text: "Explain the role of each distinct gate used in this circuit and why it was chosen over alternatives.",
      },
      {
        title: "Expected dominant noise",
        text: "Given a typical superconducting device, give the Kraus operators for the noise channel likely to dominate on this circuit and explain its effect.",
      },
      {
        title: "Stabilizer generators",
        text: "If this circuit's output is a stabilizer state, give its stabilizer generators; if not, explain which gate takes it outside the stabilizer formalism.",
      },
      {
        title: "Prove it implements …",
        text: "Prove, step by step, that this circuit implements [claimed operation, e.g. a SWAP / a Toffoli / QFT].",
      },
      {
        title: "Post-measurement state",
        text: "Explain what happens if I measure qubit [q] in the Z basis now: the probability of each outcome and the resulting post-measurement state of the remaining qubits.",
      },
    ],
  },
  {
    name: "Debug & verify",
    prompts: [
      {
        title: "Find the bug",
        text: "I expected this circuit to prepare [describe the intended state/behavior] but it doesn't. Find the bug and propose a fix as OpenQASM.",
      },
      {
        title: "Check equivalence to a target",
        text: "Check whether this circuit is equivalent to [describe the target circuit/unitary] up to global phase, and explain any difference.",
      },
      {
        title: "Wrong qubits / ordering?",
        text: "Audit this circuit for gates acting on the wrong qubits, controls and targets swapped, or operations in the wrong order.",
      },
      {
        title: "Validate the output state",
        text: "Verify that this circuit prepares a valid, normalized quantum state and report its norm and any issues.",
      },
      {
        title: "Explain the measurement stats",
        text: "Explain why the measurement statistics of this circuit look the way they do, referencing the gate structure.",
      },
      {
        title: "Trace a specific amplitude",
        text: "Walk through, term by term, how the amplitude of basis state |[bitstring]⟩ in the final state is produced.",
      },
      {
        title: "Diagnose unexpected probabilities",
        text: "The output probabilities aren't what I expected [describe what you expected]. Diagnose the discrepancy and point to the responsible gates.",
      },
    ],
  },
  {
    name: "Export & hardware",
    prompts: [
      {
        title: "Export to Qiskit",
        text: "Export this circuit as runnable Qiskit (Python) code.",
      },
      {
        title: "Export to Cirq",
        text: "Export this circuit as runnable Cirq (Python) code.",
      },
      {
        title: "Route to a coupling map",
        text: "Map this circuit onto a linear nearest-neighbor coupling map, inserting SWAPs where needed, and emit the routed OpenQASM.",
      },
      {
        title: "Estimate hardware resources",
        text: "Estimate the resources to run this circuit on hardware: depth, two-qubit gate count, T-count, and the number of qubits.",
      },
      {
        title: "Noise mitigation plan",
        text: "Which noise sources would most degrade this circuit on a superconducting device, and what concrete mitigation strategies should I apply?",
      },
      {
        title: "Export to another SDK",
        text: "Export this circuit as [Braket / Q# / PyQuil / pytket] code.",
      },
      {
        title: "Shots for a target precision",
        text: "Estimate how many measurement shots I need to resolve this circuit's output distribution (or ⟨[observable]⟩) to ±[precision], and explain the statistics.",
      },
      {
        title: "Connectivity violations",
        text: "List the two-qubit interactions in this circuit and check them against a [linear / ring / heavy-hex] coupling map; report which pairs are non-adjacent and need routing.",
      },
    ],
  },
  {
    name: "Noise & error",
    prompts: [
      {
        title: "Model realistic noise",
        text: "Propose a realistic noise model for running this circuit on a superconducting device: per-gate depolarizing, amplitude/phase damping (T1/T2), and readout error. Explain each channel and suggest concrete rates.",
      },
      {
        title: "Zero-noise extrapolation (ZNE)",
        text: "Explain how to apply zero-noise extrapolation to estimate a noise-free expectation value for this circuit: the gate-folding scale factors, the fit, and the caveats.",
      },
      {
        title: "Probabilistic error cancellation",
        text: "Outline a probabilistic-error-cancellation (PEC) plan for this circuit: the quasi-probability decomposition, sampling overhead, and when it beats ZNE.",
      },
      {
        title: "Where is the error budget?",
        text: "Given a typical noise model, which gates and qubits in this circuit dominate the total error budget, and how should I prioritize improvements?",
      },
      {
        title: "Estimate fidelity loss",
        text: "Estimate the output-state fidelity loss for this circuit under depolarizing noise at per-gate rate [p] (one- and two-qubit), and show the reasoning.",
      },
      {
        title: "Build a noise model from a backend",
        text: "Sketch a noise model approximating IBM [backend, e.g. ibm_brisbane]: rough T1/T2, single- and two-qubit gate errors, readout error, and coupling map. Note that Quantiom can import the real calibration JSON.",
      },
      {
        title: "Readout-error mitigation",
        text: "Explain how to build and apply a measurement-error mitigation (assignment / confusion matrix and its inverse) for this circuit's [n] qubits, and its limits.",
      },
      {
        title: "Dynamical decoupling",
        text: "Where could I insert dynamical-decoupling sequences (XY4 / CPMG) on the idle qubits in this circuit, and what error would they suppress?",
      },
      {
        title: "Coherence-limited depth",
        text: "Given T1 = [µs], T2 = [µs], and a [ns] gate time, estimate the maximum useful depth of this circuit before decoherence dominates the signal.",
      },
    ],
  },
  {
    name: "Benchmark & characterize",
    prompts: [
      {
        title: "Interpret an RB result",
        text: "My randomized benchmarking gave an error-per-Clifford of [value] (depolarizing parameter p = [p]). Interpret it: is that good, what does it imply for circuit depth, and what limits it?",
      },
      {
        title: "Interleaved RB gate error",
        text: "Interleaved RB on the [gate] gate gave a gate error of [r]. Explain what this isolates versus standard RB and whether it is within a reasonable range.",
      },
      {
        title: "Why did Quantum Volume fail?",
        text: "My Quantum Volume test passes up to width [m] but fails above it (heavy-output probability dropped below 2/3). Explain the likely causes and what to improve.",
      },
      {
        title: "Interpret XEB fidelity",
        text: "My cross-entropy benchmarking gave a per-cycle fidelity of [λ] on [n] qubits. Interpret it and estimate the effective per-gate error.",
      },
      {
        title: "Estimate T1 / T2",
        text: "From these decay points [paste delay → probability pairs], estimate T1 (or T2) and explain the fit. Flag if T2 > 2·T1, which is unphysical.",
      },
      {
        title: "Design a characterization experiment",
        text: "Design an experiment to measure [property, e.g. two-qubit gate error / crosstalk / readout error] on my device, including the circuit structure and the metric to extract.",
      },
      {
        title: "Mirror / volumetric read",
        text: "My mirror (volumetric) benchmark shows success dropping to ½ around width [w] × depth [d]. What does that say about my device's usable circuit shapes?",
      },
      {
        title: "Pauli error budget read",
        text: "My Pauli error budget shows qubit [q] dominated by [X / Y / Z] error. What physical mechanism does that point to, and how would I reduce it?",
      },
      {
        title: "Crosstalk / addressability",
        text: "Simultaneous RB reports addressability [r]× on qubit [q] vs isolated. Interpret it and suggest how to reduce the crosstalk.",
      },
    ],
  },
  {
    name: "Visualize & interpret",
    prompts: [
      {
        title: "Interpret the Bloch vectors",
        text: "Given these per-qubit Bloch vectors [paste, or attach via + context], describe each qubit's state, its purity, and what the circuit did to it.",
      },
      {
        title: "Area- or volume-law entropy?",
        text: "Looking at the entanglement-entropy profile across contiguous cuts of this circuit, does it follow area-law or volume-law scaling, and what does that imply physically?",
      },
      {
        title: "Explain Wigner negativity",
        text: "This state has Wigner-function negativity. Explain what negativity signifies (non-classicality / magic) and how it relates to classical simulability.",
      },
      {
        title: "Read the magic measure",
        text: "The stabilizer-Rényi magic M₂ of this state is [value]. Explain what magic measures, why M₂ = 0 means a stabilizer state, and the relevance to fault tolerance.",
      },
      {
        title: "Interpret the mutual-information map",
        text: "Interpret this pairwise mutual-information / correlation heatmap [paste or attach]: which qubits share information, and does the pattern match the circuit's gate connectivity?",
      },
      {
        title: "Chaotic or integrable?",
        text: "The level-statistics gap ratio of this Hamiltonian's spectrum is [value] (Poisson ≈ 0.386, GOE ≈ 0.531). Is the system integrable or chaotic, and what does that mean for thermalization?",
      },
      {
        title: "Read the unitary heatmap",
        text: "Interpret the unitary heatmap (magnitude + phase) of this circuit: does it look like a permutation, block-diagonal, sparse, or dense (scrambling) operator, and what does that imply?",
      },
      {
        title: "OTOC scrambling",
        text: "My OTOC C(t) saturates around t = [value]. Explain what that says about information scrambling and the effective butterfly velocity.",
      },
      {
        title: "Read the Q-sphere",
        text: "Interpret this Q-sphere: which basis states carry amplitude, their Hamming weights (latitude), and the relative phases (hue).",
      },
      {
        title: "Concurrence vs negativity",
        text: "The pairwise concurrence between qubits [i] and [j] is [c]. Interpret it alongside the log-negativity, and what monogamy says about the rest of the system.",
      },
    ],
  },
  {
    name: "Visual demos",
    prompts: [
      {
        title: "Entanglement light-cone (Ising quench)",
        text: "Build a 6-qubit Trotterized transverse-field Ising quench (H = Σ ZZ + g Σ X) starting from |0…0⟩, with the Trotter step using a free time parameter t. Then open the Space-time entropy panel and the t-sweep panel. Tell me to press play on the t slider to watch the entanglement light-cone spread across the qubit × time grid.",
      },
      {
        title: "Wigner negativity of a magic state",
        text: "Prepare a magic state by applying T to |+⟩ on a single qubit, then open the Wigner and Husimi-Q panels. Explain the negative regions of the Wigner function and what they say about non-classicality / magic.",
      },
      {
        title: "Kicked-top chaos in phase space",
        text: "Build a kicked-top Floquet circuit (alternating global rotations and a nonlinear twist) on 4 qubits with a free parameter t, then open the Wigner and Husimi panels. Describe how the phase-space portrait breaks up into chaotic structure as the kick strength grows.",
      },
      {
        title: "OTOC scrambling over time",
        text: "Build a random brickwork circuit on 5 qubits whose layers depend on a free time parameter t, then open the OTOC panel. Explain what the out-of-time-order correlator C(t) shows about information scrambling and the butterfly velocity.",
      },
      {
        title: "Bloch trajectory of a driven qubit",
        text: "Drive a single qubit with RX(t) (a free time parameter t), then open the Bloch trajectory panel. Tell me to press play on t to watch the state trace a path on the Bloch sphere, and describe the precession.",
      },
      {
        title: "Loschmidt echo & DQPT",
        text: "Quench a 4-qubit transverse-field Ising chain with a free time parameter t (Trotterized evolution from a polarized initial state), then open the Loschmidt-echo panel. Explain the dynamical quantum phase transition: the non-analytic cusps in the rate function at the critical times.",
      },
      {
        title: "GHZ on the Q-sphere",
        text: "Build a 4-qubit GHZ state and open the Q-sphere panel. Explain what I'm seeing: the two basis states at the poles (Hamming weight 0 and 4) and how phase maps to hue — a far prettier view than a flat heatmap.",
      },
      {
        title: "Scrambling in the unitary heatmap",
        text: "Build a depth-8 random circuit on 4 qubits and open the unitary-heatmap panel. Explain how a localized/structured operator differs from a dense scrambling one in the magnitude + phase heatmap.",
      },
    ],
  },
  {
    name: "Course foundations",
    prompts: [
      {
        title: "Superposition & measurement",
        text: "Build a one-qubit circuit that applies H to |0⟩, then open the Statevector, Probabilities and Bloch panels. Explain superposition, the 50/50 measurement statistics, and why the Bloch vector points along +X.",
      },
      {
        title: "Bell state & entanglement",
        text: "Build a Bell pair (H on q0, then CNOT q0→q1). Open the Statevector and Mutual-information panels and explain why the two qubits are maximally entangled and why measuring one instantly determines the other.",
      },
      {
        title: "GHZ state",
        text: "Build a 3-qubit GHZ state and open the Q-sphere and Mutual-information panels. Explain its (|000⟩+|111⟩)/√2 structure and how measuring any one qubit collapses all three.",
      },
      {
        title: "No-cloning theorem",
        text: "Explain the no-cloning theorem, then show why a CNOT 'copier' fails to clone an arbitrary qubit: prepare q0 in a superposition, apply CNOT to a blank q1, and use the Statevector/Mutual-information panels to show the result is entangled, not two copies.",
      },
      {
        title: "Phase kickback",
        text: "Demonstrate phase kickback: put a control qubit in |+⟩ and apply a controlled-Z (or controlled-T) onto a target eigenstate, then read the control's phase off the Phase-disk / Bloch panel. Explain why the eigenphase appears on the control — the mechanism behind Deutsch–Jozsa, Bernstein–Vazirani and phase estimation.",
      },
      {
        title: "Quantum teleportation",
        text: "Build the quantum-teleportation circuit (entangle an EPR pair, do a Bell-basis measurement on the unknown qubit + half the pair, then apply the conditional X/Z corrections). Use mid-circuit measurement and walk through how the unknown state moves to the third qubit without copying it.",
      },
      {
        title: "Superdense coding",
        text: "Build a superdense-coding circuit that sends two classical bits using one qubit of a shared Bell pair. Show the four encodings (I/X/Z/XZ) and explain how the receiver's Bell measurement decodes them.",
      },
      {
        title: "Deutsch–Jozsa",
        text: "Build the Deutsch–Jozsa algorithm on 3 input qubits with a balanced oracle, and explain how a single query distinguishes a constant from a balanced function via interference on the input register.",
      },
      {
        title: "Bernstein–Vazirani",
        text: "Build the Bernstein–Vazirani circuit that recovers a hidden bitstring s in one oracle query. Pick an s, show the output equals s, and explain the phase-kickback mechanism.",
      },
      {
        title: "Simon's algorithm",
        text: "Build Simon's algorithm for a 2-bit hidden period s. Explain how the measured samples form a linear system over GF(2) whose solution recovers s, and why this gives an exponential separation.",
      },
      {
        title: "Grover's search",
        text: "Build Grover's search on 3 qubits marking the state |101⟩, with the optimal number of iterations. Open the Probabilities panel and explain how the oracle + diffusion operator amplify the marked amplitude.",
      },
      {
        title: "Quantum Fourier Transform",
        text: "Build the 4-qubit Quantum Fourier Transform and open the unitary-heatmap panel. Explain the role of the Hadamards, the controlled-phase ladder, and the final bit-reversal swaps.",
      },
      {
        title: "Quantum phase estimation",
        text: "Build a quantum phase-estimation circuit that estimates the eigenphase of a T gate (phase 1/8) using a 3-qubit counting register and an inverse QFT. Show the readout and explain how precision scales with register size.",
      },
      {
        title: "Shor period-finding core",
        text: "Build the period-finding core of Shor's algorithm for a small modular-exponentiation oracle, and explain how quantum phase estimation extracts the period r and how that leads to factoring.",
      },
      {
        title: "Bit-flip error-correcting code",
        text: "Build the 3-qubit bit-flip code: encode a logical qubit, inject an X error on one physical qubit, then open the Syndrome panel and show how the syndrome detects and corrects it. Explain the repetition-code idea.",
      },
      {
        title: "CHSH / Bell-inequality violation",
        text: "Build a circuit for the CHSH game using a shared Bell pair and the optimal measurement angles. Use the Expectation panel to estimate the CHSH value and explain how it exceeds the classical bound of 2 (toward 2√2).",
      },
      {
        title: "VQE for H₂ (variational)",
        text: "Build a minimal hardware-efficient VQE ansatz for the H₂ molecule with a free parameter, set the Expectation panel to the H₂ Pauli-sum Hamiltonian, and run the optimiser. Explain the variational principle and what the minimum energy means.",
      },
      {
        title: "QAOA for MaxCut",
        text: "Build a depth-1 QAOA circuit for MaxCut on a 4-vertex ring with free γ and β parameters. Explain the cost and mixer layers and how optimising the angles approximates the maximum cut.",
      },
    ],
  },
];
