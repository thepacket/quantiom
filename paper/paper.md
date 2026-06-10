---
title: 'Quantiom: A browser-native, research-grade quantum circuit editor, simulator, and visualizer'
tags:
  - quantum computing
  - quantum circuits
  - quantum simulation
  - scientific visualization
  - TypeScript
  - OpenQASM
authors:
  - name: Andre Paquette
    orcid: 0009-0001-3961-9500
    affiliation: 1
affiliations:
  - name: Independent researcher
    index: 1
date: 4 June 2026
bibliography: paper.bib
---

# Summary

`Quantiom` is a browser-native quantum circuit editor, simulator, and
visualizer aimed at users already comfortable with quantum-computing concepts.
It runs entirely in the browser with no installation and no account: a
multi-tab editor over a 64-gate palette feeds three simulator backends — a
pure-TypeScript dense statevector simulator (up to 20 qubits), an
Aaronson–Gottesman stabilizer-tableau simulator [@aaronson2004] for
Clifford circuits (up to 1024 qubits), and a quantum-trajectory simulator for
calibrated noise — and a column of roughly forty research-grade panels updated
on every edit. Circuits round-trip through OpenQASM 3 [@cross2022] and export
to eight code and document formats (Qiskit [@qiskit], Cirq [@cirq], Amazon
Braket, Microsoft Q\#, PyQuil, pytket, OpenQASM 2, and `quantikz` LaTeX),
covering the path from in-browser exploration to execution on real hardware.

Beyond the editor and the standard statevector / probability / Bloch views,
`Quantiom` treats analysis and visualization as first-class: an expectation-value
panel evaluates single Pauli strings or full weighted Pauli-sum Hamiltonians,
with Adam, SGD, and Quantum Natural Gradient [@stokes2020] optimizers, zero-noise
extrapolation [@temme2017; @li2017], probabilistic error cancellation, and
barren-plateau diagnostics [@mcclean2018]; a Hamiltonian panel emits Trotter
circuits at first, second (Strang), or fourth (Suzuki [@suzuki1991]) order, or
via qDrift randomized compilation [@campbell2019]; and twenty-four entanglement
and dynamics visualizers — including mutual-information and entanglement-spectrum
maps, discrete Wigner and spin Husimi-Q phase-space distributions, a
stabilizer-Rényi "magic" readout, out-of-time-order correlators, Loschmidt-echo
/ dynamical-quantum-phase-transition traces, a Pauli transfer matrix, and a
ZX-calculus diagram — sit as peers alongside the core panels. A one-click
compile pipeline runs transpilation, peephole optimization, and greedy SWAP
routing to a target native gate set, decomposing arbitrary two-qubit unitaries
via the Cartan (KAK) decomposition.

![The `Quantiom` workspace: a four-qubit LiH Jordan–Wigner Trotter step, with the AI assistant explaining the circuit in rendered LaTeX alongside the statevector, probability, and Bloch panels.\label{fig:overview}](../screenshots/quantiom.png)

# Statement of need

Quantum-computing research and education rely on circuit-level tools, but the
existing options force a trade-off. Production frameworks such as Qiskit
[@qiskit], Cirq [@cirq], and the high-performance Clifford simulator Stim
[@gidney2021stim] are powerful but require a local Python installation, a coding
workflow, and separate plotting code to see what a circuit does. Vendor
composers such as IBM Quantum Composer [@ibmcomposer] are graphical and
browser-based but are tied to one hardware ecosystem and expose a deliberately
limited feature set. Lightweight in-browser tools such as Quirk [@quirk] excel
at live, exploratory single-state intuition but are not designed for
multi-circuit work, noise modeling, error mitigation, transpilation, or the
breadth of analysis visualizations that research increasingly depends on.

`Quantiom` fills the gap between these categories: a zero-install,
vendor-neutral, browser-native tool that is nonetheless deep enough for
research and advanced coursework. It assumes the user knows the concepts and
declines to simplify the editor, exposing arbitrary-angle rotations, arbitrary
unitary matrices, custom gates and subroutines, classical registers,
mid-circuit measurement, conditional and anti-controlled gates, and OpenQASM 3
round-tripping. Its distinguishing stance is that visualizers and error
mitigation are not afterthoughts but peer panels with the same update cadence
and screen-space rights as the statevector view, while a strict default-fast
design keeps every opt-in feature — noise, optimization diagnostics, equivalence
checks, transpilation — at zero per-frame cost until the user invokes it.

This makes `Quantiom` useful for several audiences: researchers prototyping
variational [@peruzzo2014] or Hamiltonian-simulation circuits who want immediate,
multi-faceted visual feedback before exporting to a hardware SDK; instructors and
students in advanced quantum-computing courses who need a serious tool rather
than a guided tutorial; and developers who want to inspect, transpile, or convert
circuits across frameworks without leaving the browser.

# Quality and correctness

The numeric core is covered by a comprehensive automated test suite — 1001 tests
run under continuous integration on every commit — that validates the
statevector simulator, every gate's matrix unitarity and algebraic identities,
the stabilizer tableau (cross-checked against the dense simulator), Pauli
expectations, circuit-equivalence checking, gate inversion, the OpenQASM 3
round-trip, all eight emitters, the transpiler and router, the Trotter builder,
the noise simulator, the optimizer, the KAK decomposition, and all
twenty-four visualizer substrates, each against analytic ground truth. The same
checks are additionally exposed in-application: a "Self-test" button re-runs a
cross-section of several hundred validations live in the user's browser and
reports the results, so correctness can be verified directly rather than taken
on trust.

# Acknowledgements

`Quantiom` was implemented by Anthropic's Claude Code agent under the direction
of the author, who set the product direction, made all design and scope
decisions, and evaluated each iteration on a live deployment. We acknowledge the
authors of the algorithms and open standards on which `Quantiom` builds,
referenced below.

# References
