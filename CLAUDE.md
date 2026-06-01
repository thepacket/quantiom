# Quantiom — notes for Claude

## What this is

Quantum-computing circuit editor / precise simulator / sonorizer / visualizer with numerical and symbolic math. Aimed at users **already comfortable with QC concepts** — a serious tool, not a vulgarizer. IBM Quantum Composer is the floor.

## Product principles

- **Editor-first.** No tutorial system in the initial scope. The "educator" facet is rich inline math and formal derivations alongside what the user builds — not a guided lesson path.
- **Don't simplify the editor to accommodate beginners.** Advanced features (arbitrary-angle symbolic rotations, custom gates, classical registers, mid-circuit measurement, conditional gates, barriers, subroutines, OpenQASM 3 round-trip, multi-circuit projects) are expected.
- **Symbolic-native IR.** Gate parameters are symbolic expressions from day one; numeric is derived. Panels show symbolic form by default. Retrofitting symbolic onto a numeric IR is expensive; don't.
- **Sonorizer is a peer panel**, not the headline. Same update cadence and screen-space rights as statevector / Q-sphere / probabilities.

## Shape

- `client/` — Vite + React + TypeScript. Install-free in the browser, device-portable. Web Audio for the sonorizer.
- `server/` — FastAPI. Bridges multi-language packages (Python sympy/qiskit/numpy at minimum; future Julia/Rust/C++ simulators). The server is the canonical compute path; the browser may run small/fast cases locally for latency.
- `docs/` — design notes.

## Conventions

- TypeScript strict. Python typed (mypy-friendly).
- Symbolic representation: sympy on the server, a symbolic AST on the client. Floats are one possible leaf, not the default.
- Don't add Pyodide-in-the-browser as the main simulation path; the server exists precisely so we're not stuck with one language's ecosystem.
