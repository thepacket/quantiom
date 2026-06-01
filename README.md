# Quantiom

Quantum-computing circuit editor, precise simulator, sonorizer, and visualizer — with numerical and symbolic math.

For users already comfortable with quantum-computing concepts. IBM Quantum Composer is the floor, not the ceiling.

## Shape

- **client/** — install-free web UI (Vite + React + TS). Multi-device.
- **server/** — integration layer that bridges packages across languages (Python sympy/qiskit/numpy to start; room for Julia, Rust, C++ simulators later). FastAPI.
- **docs/** — design notes.

## Headline features

- Advanced circuit editor: arbitrary-angle symbolic rotations, custom gates, classical registers, mid-circuit measurement, conditional gates, barriers, subroutines, OpenQASM 3 round-trip, multi-circuit projects.
- **Symbolic-native** simulation: exact statevectors, unitaries as tensor-product expressions, exact phases like `e^(iπ/8)`, closed-form partial traces. Numeric is a `.evalf()` away.
- Visualizer panels: statevector, Q-sphere, probability histogram, density matrix, reduced states, expectation values — symbolic by default, numeric on toggle.
- **Sonorizer**: peer panel that maps the evolving statevector to audio. Per-amplitude additive synthesis is the primary mapping.

## Dev

See [client/README.md](client/README.md) and [server/README.md](server/README.md).
