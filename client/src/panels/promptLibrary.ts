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
    ],
  },
];
