# Quantiom

Quantum-computing circuit editor, precise simulator, sonorizer, and visualizer
— with numerical and symbolic math.

For users already comfortable with quantum-computing concepts. IBM Quantum
Composer is the floor, not the ceiling.

Live: **<https://quantiom.fly.dev>** (or your own deploy).

## Shape

- **client/** — install-free web UI (Vite + React + TS). Multi-device.
- **server/** — bridges multi-language packages (Python sympy/numpy to start;
  room for Julia, Rust, C++ simulators later). FastAPI.
- **examples/** — 38 hand-written OpenQASM 3 example circuits.
- **docs/** — design notes.

## Editor

- **Gate palette** — 53 gates across 13 categories, with category-coloured
  borders, search box, and collapsible category groups:
  - Identity & Pauli (I, X, Y, Z)
  - Clifford + T (H, S, S†, √X, √X†, T, T†)
  - Phase & Rotation (P, RX, RY, RZ)
  - General U (U, U1, U2, U3)
  - Two-qubit Clifford (CX, CY, CZ, CH, C√X, C√X†, SWAP, iSWAP, DCX, ECR)
  - Controlled rotations (CRX, CRY, CRZ, CP, CU, CU1, CU3)
  - Ising / native (RXX, RYY, RZZ, RZX, XX+YY, XX−YY)
  - Three-qubit (CCX, CCZ, CSWAP, RCCX, RC3X)
  - Multi-controlled (C3X, C4X, MCX, MCP, MCU — variable arity)
  - State prep (|0⟩, |1⟩, |+⟩, |−⟩, |i⟩, |−i⟩, Initialize)
  - Non-unitary (Measure Z/X/Y, Reset)
  - Control flow (if, switch, while, box)
  - Markers (barrier, delay)
- **Canvas** — unbounded qubits, unbounded columns; SVG rendering. Qubit wires
  with per-category–coloured gate visuals, classical-bit bus, vertical
  connectors for multi-qubit gates, distinct glyphs (CNOT ⊕, SWAP ×, measure
  meter, reset, state-prep, barrier, delay).
- **Drag and drop**
  - Drag a tile from the palette onto a qubit cell to place a gate.
  - Drag a placed gate to move it; column auto-bumps on collision.
  - Drag the control dot or target glyph of a placed multi-qubit gate to
    reassign its qubit independently (the "stretch" gesture).
  - Custom drag-image ghost shows the gate symbol under the cursor.
- **Inspector** — column, controls, targets, classical bits, symbolic
  parameters as free-form expressions (e.g. `π/2`, `θ`, `2*t + π/4`).
- **Add / remove qubits and classical bits** from the toolbar (no fixed
  upper limit beyond the simulator's symbolic cap of 8 qubits).
- **Undo / redo** — Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z (also Ctrl + Y); 100
  entries deep. Consecutive parameter edits and consecutive QASM text edits
  coalesce within 500ms so typing is a single undo step.
- **Auto-save** to `localStorage`. The circuit restores on refresh.
- **File menu** — open `.qasm` from disk, download the current circuit as
  `.qasm`, or pick from the bundled **Examples** dropdown.
- **Dark theme** throughout.

## Simulator (server)

- **Symbolic-native** sympy backend. The internal statevector is a list of
  sympy expressions; nothing is collapsed to floats unless asked.
- Big-endian basis convention (qubit 0 is the MSB of the basis index).
- **Capped at 8 qubits** for statevector simulation, **3 qubits** for the
  full symbolic unitary matrix (2ⁿ × 2ⁿ sympy expressions get expensive
  quickly).
- **Greek-glyph parameter parsing** — `π`, `θ`, `φ`, `λ`, `γ`, `β`, `τ` are
  recognized as standard symbols; arbitrary other identifiers become free
  sympy `Symbol`s. `e^(iπ/4)` round-trips.
- **Variable-arity** multi-controlled gates (MCX, MCP, MCU) — the simulator
  reads the number of controls from the placed gate.
- **State-prep** gates (Init |+⟩, etc.) apply when the targeted qubit is
  unentangled with the rest; reported as skipped otherwise.
- **Parameter substitution** — every request can carry `parameterValues`
  for any free symbol; values are substituted just before numeric
  evaluation. The symbolic display remains symbolic.
- **LRU cache** (32 entries) keyed by circuit IR. Parameter sweeps —
  including the animation Play button — only re-run the numeric path,
  so each frame is ~milliseconds.
- **OpenQASM 3** — both an emitter and a parser. Both target the
  `stdgates.inc` library plus the `ctrl(n) @` modifier for variable-arity
  multi-controlled gates. Verified round-trip on the bundled examples.

### Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{"status": "ok"}` |
| `POST /api/simulate/statevector` | symbolic ket LaTeX, per-amplitude `(re, im, expr, latex)`, probabilities, per-qubit Bloch vectors, skipped gates, free symbol names |
| `POST /api/simulate/unitary` | symbolic 2ⁿ × 2ⁿ matrix as LaTeX and stringified entries |

## Visualizer panels

The right column stacks collapsible panels. Each panel persists its
collapsed state per panel id in `localStorage`. Every panel has a
**copy-to-clipboard** button in its header.

- **Parameters** — sliders for every free symbol detected in the circuit
  (e.g. `θ`, `φ`, `λ`, …). The literal symbol **`t`** is special: when it
  appears anywhere, the panel sprouts a circular **▶** button and an Hz
  slider (0.05–3 Hz). Playback runs an internal clock and pushes
  substitutions at ~15fps; the Bloch vectors orbit, the probability bars
  pulse, the sonorizer's harmonics rotate.
- **Statevector** — KaTeX-rendered `|ψ⟩ = …` ket expression plus a
  per-amplitude table (`|basis⟩` and amplitude in LaTeX). "hide zeros"
  toggle.
- **Probabilities** — horizontal SVG bar chart of `|amplitude|²`.
- **Bloch spheres** — one axonometric sphere per qubit with axis labels
  (`|0⟩, |1⟩, |+⟩, |−⟩, |±i⟩`), a state-vector arrow, and a `|r|` purity
  readout that quantifies how mixed the reduced state is.
- **Formal math (U)** — the circuit's symbolic unitary as a KaTeX matrix.
  Default-collapsed because matrices grow fast.
- **Sonorizer** — Web Audio additive synthesis. A single `OscillatorNode`
  whose waveform is rebuilt every frame from the statevector via
  `createPeriodicWave(real, imag)`. Basis state |i⟩ becomes the (i+1)-th
  harmonic of a base frequency; `Re[aᵢ]` is its cosine coefficient and
  `Im[aᵢ]` its sine coefficient. The time-domain signal is literally the
  inverse Fourier series of the amplitude vector. Controls: ▶, volume
  slider, base-frequency slider (55–880 Hz, default 220 Hz = A3).
- **OpenQASM 3** — editable textarea with line numbers. Edits debounce-
  parse and replace the circuit IR on every successful parse; failures
  surface inline with line numbers. Round-trips cleanly with the canvas.

Each panel is wrapped in its own React error boundary; a render-phase
crash in one panel does not break the others.

## Examples

The Examples dropdown bundles 38 hand-written circuits grouped by topic:

- **Intro** — coin flip, Walsh–Hadamard, magic state `|H⟩ = T|+⟩`
- **Entanglement** — Bell, GHZ, W state, linear cluster, phased
  Schrödinger cat
- **Protocols** — teleportation, entanglement swapping, superdense coding,
  phase kickback, CHSH inequality, BB84
- **Algorithms** — Deutsch (1-bit), Deutsch–Jozsa, Bernstein–Vazirani,
  Simon (s = 11), Grover (1 and 2 iterations), QFT, inverse QFT, QPE,
  Draper adder, quantum-walk step
- **Arithmetic & ECC** — half adder, Cuccaro ripple-carry adder, bit-flip
  code, Steane [[7,1,3]] encoder
- **Decompositions** — Toffoli → Clifford + T
- **Variational** — QAOA on a triangle, hardware-efficient ansatz
- **Animation** — Rabi + Larmor, QFT of evolving state, phase fountain,
  Ising Trotter, multi-frequency cascade, dense swirl
- **Sonorizer** — pure octave, tremolo, animated phase, Bell chord,
  sawtooth-like

## Dev

```
cd server && python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/uvicorn quantiom.app:app --reload --port 8000

cd client && npm install
npm run dev      # http://localhost:5173, proxies /api → :8000
npm run typecheck
npm run build
```

See [client/README.md](client/README.md) and [server/README.md](server/README.md)
for more.

## Deploy (Fly.io)

Single Fly app **`quantiom`** — the server hosts both `/api/*` and the
built client.

```
fly apps create quantiom        # one-time
fly deploy
```

[Dockerfile](Dockerfile) builds the client in a node stage and copies the
resulting `dist/` into `quantiom/static`; the FastAPI app mounts that
directory at `/` when present. [fly.toml](fly.toml) configures
auto-stop / auto-start with a `/api/health` check.

## License

MIT — see [LICENSE](LICENSE).

Third-party deps and their licenses are tracked in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). All bundled deps are
permissively licensed (BSD / MIT / PSF); none are copyleft.

## Contributing

Quantiom is a single-author project and **does not accept pull requests**;
see [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports go to
[Issues](../../issues); everything else — questions, ideas, just saying hi
— is the right fit for [Discussions](../../discussions).
