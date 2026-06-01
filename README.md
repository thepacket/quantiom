# Quantiom

Quantum-computing circuit editor, simulator, sonorizer, and visualizer.
Runs entirely in the browser.

For users already comfortable with quantum-computing concepts. IBM Quantum
Composer is the floor, not the ceiling.

Live: **<https://quantiom.fly.dev>**.

## Shape

- **client/** — Vite + React + TypeScript. The UI, the simulator, the
  parameter expression evaluator, the OpenQASM 3 round-trip, the
  sonorizer — all of it.
- **server/** — minimal FastAPI app whose only job is `/api/health` for
  Fly's checks and serving the built client as static files.
- **examples/** — 33 hand-written OpenQASM 3 example circuits.

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
- **Canvas** — unbounded qubits and columns; SVG rendering. Distinct
  visuals for the CNOT ⊕, SWAP ×, measure meter, reset, state-prep,
  barrier, delay; per-category coloured gate strokes.
- **Drag and drop**
  - Palette → cell: place a new gate.
  - Placed gate → cell: move the whole gate; column auto-bumps on
    collision.
  - Control dot or target glyph → different qubit: stretch-gesture
    reassigns just that role.
- **Inspector** — column, controls, targets, classical bits, parameter
  expressions (free-form: `π/2`, `θ`, `2*t + π/4`, `sin(t)`).
- **Undo / redo** — Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z (or Ctrl + Y); 100
  entries; consecutive parameter or QASM edits coalesce within 500 ms.
- **Auto-save** to `localStorage`; circuit restores on refresh.
- **File menu** — open `.qasm`, download `.qasm`, or pick from the
  bundled **Examples** dropdown.
- **Dark theme** throughout.

## Simulator (in the browser)

The quantum state lives in a `Float64Array` with interleaved real / imaginary
parts. Gate application is in-place. No server roundtrips, no GIL, no
sympy.

- **20-qubit cap** — `2^20 = 1 048 576` amplitudes × 16 bytes = 16 MB of
  state. Plenty of headroom in any modern browser; raises if you go past.
- **Unbounded gate count** — each gate is O(d · 2ⁿ) where d = 2ᵏ for a
  k-qubit gate. A 12-qubit Hadamard-on-each finishes in milliseconds; a
  6-qubit 35-gate circuit (the `anim_swirl_6q` example) animates at
  full rate.
- **Parameter expressions** — your gate params are JIT-compiled with a
  tiny `new Function` based evaluator. Greek letters (π, θ, φ, λ, γ, β, τ,
  α, δ, ω) and a small set of math functions (`sin`, `cos`, `tan`, `sqrt`,
  `exp`, `ln`, `pow`) are recognised; everything else becomes a free
  variable that you set via the Parameters panel.
- **Gate coverage** — all 53 gates in the palette. State-prep gates
  (`init0`, `init1`, `init+`, `init−`, `init+i`, `init−i`) apply when the
  target qubit is unentangled with the rest; otherwise they're listed in
  the panel's "skipped" section. Measure, reset, control flow, and
  `initialize(state)` are intentionally skipped (the simulator is pure
  state-vector).

The simulator code lives in [client/src/sim/](client/src/sim/):
[complex.ts](client/src/sim/complex.ts), [expr.ts](client/src/sim/expr.ts),
[matrices.ts](client/src/sim/matrices.ts), [apply.ts](client/src/sim/apply.ts),
[simulate.ts](client/src/sim/simulate.ts).

## Visualizer panels

The right column stacks collapsible panels. Each panel persists its
collapsed state per panel id in `localStorage`. Every panel has a
**copy-to-clipboard** button in its header.

- **Parameters** — sliders for every free symbol detected in the circuit
  (e.g. `θ`, `φ`, `λ`). The literal symbol **`t`** is special: when it
  appears anywhere, the panel sprouts a circular **▶** button and an Hz
  slider (0.05–3 Hz). Playback runs an internal clock that pushes new t
  values directly into the React state at ~15 fps — the Bloch vectors
  orbit, the probability bars pulse, the sonorizer's harmonics rotate.
- **Statevector** — basis-state table with numeric `Re + Im·i` per
  amplitude, formatted to 4 decimals. "hide zeros" toggle.
- **Probabilities** — horizontal SVG bar chart of `|amplitude|²`.
- **Bloch spheres** — one axonometric sphere per qubit with axis labels
  (`|0⟩, |1⟩, |+⟩, |−⟩, |±i⟩`), state-vector arrow, and a `|r|` purity
  readout that quantifies how mixed the reduced state is.
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

The Examples dropdown bundles 33 hand-written circuits grouped by topic:

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
.venv/bin/uvicorn quantiom.app:app --reload --port 8000   # health + static

cd client && npm install
npm run dev      # http://localhost:5173, proxies /api → :8000
npm run typecheck
npm run build
```

(The server is optional during dev — the simulator runs in the browser,
so `npm run dev` alone is enough unless you want to exercise the health
check or the production static-serving path.)

## Deploy (Fly.io)

Single Fly app **`quantiom`** — the server hosts the built client.

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
