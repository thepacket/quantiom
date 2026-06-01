# Quantiom

**A browser-native research-grade quantum circuit editor, simulator,
and visualizer.**

Quantiom builds circuits visually, runs them through a pure-TypeScript
`Float64Array` statevector simulator (≤ 20 qubits), a Stim-style
Aaronson-Gottesman tableau (Clifford + measurements, scaling to
thousands of qubits), or a quantum-trajectory noise simulator with
calibrated NISQ channels — and visualizes the state through Bloch
spheres, phase disks, exact and shot-sampled probability histograms,
reduced density matrices, ⟨P⟩ Pauli expectations, and resource
estimates. Free parameters become live sliders, an animation clock
drives them at 15 fps, and the Expectation panel will gradient-descend
them to minimise ⟨H⟩ for VQE-style loops. Noise can be calibrated by
importing an IBM `BackendProperties` JSON snapshot (T1, T2, sx error,
cx error, readout error per qubit). Circuits round-trip OpenQASM 3,
export to a Qiskit Python script, and serialize into a shareable URL
hash.

For users already comfortable with quantum-computing concepts. IBM
Quantum Composer is the floor, not the ceiling.

Live: **<https://quantiom.fly.dev>**

## Authorship

Quantiom is a two-name project:

- **[Claude](https://www.anthropic.com/claude-code)** — Anthropic's
  coding agent, sole coder. Every line of TypeScript, Python, the
  Dockerfile, the `fly.toml`, and the docs you're reading was written
  by the agent.
- **[Andre Paquette](https://github.com/andrepaquette)** — human
  maintainer. Set the direction, made design and scope decisions,
  evaluated each iteration on a real fly.io deployment, and decided
  when to ship — but didn't write the code by hand.

Bugs and design choices are the agent's; the call to keep them or fix
them is the maintainer's.

## Shape

- **client/** — Vite + React + TypeScript. UI, simulators, parameter
  expression evaluator, OpenQASM 3 round-trip, Qiskit codegen, share
  links, noise model, autodiff optimiser, equivalence checker.
- **server/** — minimal FastAPI app whose only job is `/api/health` for
  Fly's checks and serving the built client as static files.
- **examples/** — 62 hand-written OpenQASM 3 example circuits.

## Editor

- **55-gate palette** across 13 categories, with category-coloured
  borders, search box, and collapsible category groups:
  - Identity & Pauli (I, X, Y, Z)
  - Clifford + T (H, S, S†, √X, √X†, T, T†)
  - Phase & Rotation (P, RX, RY, RZ)
  - General U (U, U1, U2, U3, **`u_arb`** — arbitrary 2×2, **`u_arb_2`** — arbitrary 4×4)
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
  expressions (free-form: `π/2`, `θ`, `2*t + π/4`, `sin(t)`); per-control
  **anti-control** toggle (●/○); compact Re/Im **matrix entry grid** for
  `u_arb` (2×2) and `u_arb_2` (4×4); per-gate **classical condition**
  picker (`fire only if c[k] == v`).
- **Step-through inspector** — slider above the canvas (⏮ ◀ ▶ ⏭)
  freezes the simulation at any column for gate-by-gate debugging;
  default "follow the end" so the sim shows the final state.
- **Custom user-defined gates** — "Save as gate" captures the current
  circuit as a reusable block; the new tile appears under a pink
  "Your gates" category in the palette. Right-click to delete.
  Persisted in localStorage.
- **Undo / redo** — Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z (or Ctrl + Y);
  100 entries; consecutive parameter or QASM edits coalesce within 500 ms.
- **Auto-save** to `localStorage`; circuit restores on refresh.
- **File menu** — Open `.qasm`, Download `.qasm`, Download `.py` (Qiskit),
  Export SVG, Share link, or pick from the bundled **Examples** dropdown
  (62 circuits, 8 categories).
- **Dark theme** throughout.
- **Title bar** — the current circuit's name is shown centered at the top.
  Loading from Examples uses the example label; opening a `.qasm` from
  disk uses the filename. The Quantiom logo on the left shows the
  running build's semver, commit count, and short git SHA.

## Simulators

Three backends, dispatched automatically based on the circuit:

### Statevector (default)

A `Float64Array` of length `2 · 2ⁿ` with interleaved real / imaginary
parts. Gate application is in-place. No server round-trips, no GIL.

- **20-qubit cap** — 16 MB of state.
- **Unbounded gate count** — each gate is O(d · 2ⁿ) where d = 2ᵏ for a
  k-qubit gate. A 12-qubit Hadamard-on-each finishes in milliseconds.
- **Parameter expressions** — JIT-compiled with a small `new Function`
  evaluator. Greek letters (π, θ, φ, λ, γ, β, τ, α, δ, ω) and standard
  math functions (`sin`, `cos`, `tan`, `sqrt`, `exp`, `ln`) are
  recognised; everything else becomes a free variable that you set via
  the Parameters panel.
- **Mid-circuit measurement** — measurements sample an outcome from the
  qubit's marginal, project onto the matching subspace, renormalise, and
  write the bit to the classical register. Subsequent gates carrying a
  `condition` execute only when the matching classical bit holds the
  expected value. Deterministically seeded per (gates, params) so
  re-renders don't shuffle.

### Stabilizer / Clifford fast path

Aaronson-Gottesman tableau (`arXiv:quant-ph/0406196`). Auto-detected for
Clifford-only circuits (`{H, S, S†, √X, √X†, X, Y, Z, CX, CY, CZ, SWAP,
measure, reset}`) when n > 16 — sub-threshold Clifford circuits stay on
the statevector path so the user still sees full amplitudes.

- **1024-qubit cap** — 2n × (2n+1) bytes of tableau, ≈ 2 MB at n = 1024.
- **O(n²) per gate** — H, S, CNOT update generators in linear time.
- **Bloch from the tableau** — per-qubit GF(2) elimination on the
  stabilizer rows extracts the exact reduced single-qubit state.
- **Aaronson-Gottesman measurement** — §4.1–4.2 random/deterministic
  branching with the rowsum phase-tracking trick.

### Noise mode (quantum trajectories)

Opt-in. Disabled by default; switching off restores the bare statevector
path with zero overhead. When on:

- **Stochastic Pauli depolarising channels** — 1-qubit on single-qubit
  gates, 2-qubit (15 non-identity Pauli pairs) on two-qubit gates,
  per-qubit at the 2-qubit rate on larger gates.
- **Amplitude damping (T1)** and **phase damping (T2)** via
  state-conditional jump operators.
- **Trajectory averaging** — runs T independent simulations (default 256,
  presets up to 4 096), averages probabilities and Bloch vectors.
- **Per-qubit rate overrides** — a `perQubit` array with optional
  1-qubit depolarising / γ_AD / γ_PD / readout values shadows the
  globals per qubit.
- **IBM `BackendProperties` importer** — load a `backend.properties()
  .to_dict()` JSON snapshot and Quantiom populates per-qubit T1, T2,
  sx-error, cx-error, and readout-error using the device's median sx
  gate time to convert T1/T2 into per-gate damping probabilities. A
  `source` field shows up in the panel ("ibmq_kyiv @ 2026-05-12") so
  you know which snapshot is active.

The simulator code lives in [client/src/sim/](client/src/sim/):
[complex.ts](client/src/sim/complex.ts), [expr.ts](client/src/sim/expr.ts),
[matrices.ts](client/src/sim/matrices.ts), [apply.ts](client/src/sim/apply.ts),
[simulate.ts](client/src/sim/simulate.ts),
[stabilizer.ts](client/src/sim/stabilizer.ts),
[simulateNoisy.ts](client/src/sim/simulateNoisy.ts),
[measure.ts](client/src/sim/measure.ts),
[noise.ts](client/src/sim/noise.ts).

## Visualizer panels

The right column stacks collapsible panels. Each panel persists its
collapsed state per panel id in `localStorage`. Every panel has a
**copy-to-clipboard** button in its header. Collapsed panels cost
nothing per frame — `SimResult` exposes `amplitudes`, `probabilities`,
`blochVectors` as lazy getters and panel bodies short-circuit their
`useMemo`s when hidden.

- **Parameters** — sliders for every free symbol detected in the
  circuit (e.g. `θ`, `φ`, `λ`). The literal symbol **`t`** is special:
  when it appears anywhere, the panel sprouts a circular **▶** button
  and an Hz slider (0.05–3 Hz). Playback runs an internal clock that
  pushes new t values directly into the React state at ~15 fps — the
  Bloch vectors orbit and the probability bars pulse.
- **Statevector** — basis-state table with numeric `Re + Im·i` per
  amplitude, formatted to 4 decimals. Final classical-register values
  shown when the circuit has measurements. Notice cards in noise mode
  ("mixed state, see Probabilities and Bloch") and Clifford mode
  ("tableau represents the same state in O(n²) memory").
- **Probabilities** — horizontal SVG bar chart with two switchable
  modes:
  - **exact** (default): each bar is `|amplitude|²`.
  - **shots**: samples N measurement outcomes from the exact
    distribution and shows the empirical histogram, the way real
    quantum hardware behaves. Presets 100, 1 024, 8 192, 100 000, a
    **↻ resample** button, and the exact distribution overlaid as a
    dashed accent outline behind the sampled bars. Mode and shot
    count persist in localStorage.
- **Bloch spheres** — one axonometric sphere per qubit with axis
  labels (`|0⟩, |1⟩, |+⟩, |−⟩, |±i⟩`), state-vector arrow, and a `|r|`
  purity readout.
- **Phase disks** — per-qubit visualisation of the off-diagonal
  ρ_q[0,1] = (r_x + i r_y) / 2 in the complex plane. Complements the
  Bloch panel by isolating the X-Y phase information.
- **Expectation ⟨P⟩** — pick a Pauli (`I, X, Y, Z`) per qubit, get a
  live ⟨ψ|P|ψ⟩ readout. In noise mode the value is trajectory-averaged
  with a "avg of N trajectories" tag. When the circuit has free
  parameter symbols, an **Optimise** subsection appears: pick which
  symbols to vary, minimise or maximise, set steps and learning rate,
  click Run. Quantiom runs central finite differences for the
  gradient and plain gradient descent in the browser, then pushes the
  optimised parameters back into the sliders.
- **Reduced density matrix** — pick a qubit subset (≤ 4), see the
  2^|S| × 2^|S| matrix and `Tr(ρ²)` purity. Default-collapsed.
- **Resources** — total gates, 1-qubit / 2-qubit / multi-qubit
  breakdown, T-count and T-fraction, parallel depth, longest-qubit
  length, distinct qubits, free-symbol count, plus a Clifford-only
  flag when the circuit would route to the tableau path.
- **Noise model** — enable toggle, sliders for 1q depolarising, 2q
  depolarising, amplitude damping γ, phase damping γ, readout bit-flip;
  trajectory count with 64 / 256 / 1024 / 4096 presets; **Import IBM
  BackendProperties .json** button; editable per-qubit rate table.
- **Equivalence check** — load a comparison `.qasm`, click Compare:
  for n ≤ 8 Quantiom computes both full 2ⁿ × 2ⁿ unitaries column by
  column and compares entrywise (exact); for n > 8 it samples 16
  random basis-state columns. Reports max amplitude deviation, the
  factored-out global phase, and (on mismatch) the basis index where
  the largest deviation occurred.
- **Syndromes (Clifford shots)** — for Clifford-only circuits with
  measurements, click Sample to run the tableau N times and tabulate
  classical bitstring histograms. Presets 100, 1 024, 8 192, 100 000.
  Stim-style QEC decoder benchmarks, in a browser tab.
- **OpenQASM 3** — editable textarea with line numbers. Edits
  debounce-parse and replace the circuit IR on every successful parse;
  failures surface inline with line numbers. Round-trips cleanly with
  the canvas, including anti-controls via `negctrl @` modifier chains
  and conditional gates via `if (c[k] == v) …` wrappers.

Each panel is wrapped in its own React error boundary; a render-phase
crash in one panel does not break the others.

## Researcher workflows

- **Parameter optimisation (VQE / QAOA)** — pick an observable in
  Expectation, click Optimise; Quantiom gradient-descends in the
  browser. Works with noise enabled (trajectory-averaged gradients).
- **Calibrated noise comparison** — import an IBM `BackendProperties`
  snapshot, run any circuit, compare against actual hardware output.
- **QEC decoder benchmarks** — build a stabilizer code with ancillas,
  add a syndrome-extraction sequence, sample 10 k shots, eyeball the
  syndrome distribution; works up to ~1 000 qubits on the Clifford
  path.
- **Compiler equivalence checking** — "did my optimisation pass
  preserve the unitary?" Load both and compare.
- **Resource estimation** — read T-count, two-qubit count, and
  parallel depth straight from the IR.
- **Dynamic circuits** — mid-circuit measurement + classical
  conditioning works end-to-end (teleportation, adaptive QEC, …).
- **Notebook export** — Download `.py` produces a self-contained
  `QuantumCircuit(...)` script for direct paste into a Jupyter cell.
- **Collaboration** — **Share** copies a URL with the entire circuit
  encoded in the hash fragment (`#c=<gzip+base64url>`). Hashes never
  hit the server. Paste the link in chat; the recipient sees your
  circuit instantly.

## Examples

The Examples dropdown bundles 62 hand-written circuits grouped by
topic:

- **Intro** — coin flip, Walsh–Hadamard, magic state `|H⟩ = T|+⟩`.
- **Entanglement** — Bell, GHZ (incl. 8q / 12q / 16q), W state, linear
  cluster, phased Schrödinger cat.
- **Protocols** — teleportation, entanglement swapping, superdense
  coding, phase kickback, CHSH inequality, BB84.
- **Algorithms** — Deutsch (1-bit), Deutsch–Jozsa (incl. 6q),
  Bernstein–Vazirani (6q, 8q), Simon (s = 11), Grover (1, 2, 4q, 5q),
  QFT (5q, 8q), inverse QFT, QPE, amplitude amplification, Hadamard
  cascade 8 / 12 / 16q, quantum-walk step.
- **Arithmetic & ECC** — half adder, Cuccaro 3+3-bit ripple-carry
  adder, bit-flip code, Steane [[7,1,3]] encoder, 5-qubit perfect
  code.
- **Hamiltonian dynamics** — Ising-6 Trotter, XY-4 Trotter.
- **Decompositions** — Toffoli → Clifford + T.
- **Variational** — QAOA on a triangle, hardware-efficient ansatz,
  VQE-2L, VQE-6L.
- **Animation** — Rabi + Larmor, QFT of evolving state, phase
  fountain, Ising Trotter, multi-frequency cascade, dense swirl
  (deep-swirl-8 with ~100 gates).

## Interoperability

- **OpenQASM 3** round-trip with anti-controls (`negctrl @`),
  conditional gates (`if (c[k] == v) …`), the `ctrl(n) @` modifier
  chain, and multi-statement lines.
- **Qiskit Python** export — `qc = QuantumCircuit(...)` with parameter
  declarations, `ctrl_state=` for anti-controls, and the same
  state-prep / measurement decompositions.
- **Share link** — full circuit IR → JSON → gzip → base64url → URL
  hash fragment. Zero server cost; hashes never hit the wire.
- **SVG export** of the canvas with embedded gate CSS and dark theme,
  for papers and slides.

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

[Dockerfile](Dockerfile) builds the client in a node stage and copies
the resulting `dist/` into `quantiom/static`; the FastAPI app mounts
that directory at `/` when present. [fly.toml](fly.toml) configures
auto-stop / auto-start with a `/api/health` check. The Dockerfile
installs git and copies `.git` in so the build-time semver / commit
count / short SHA injection works inside the production image.

## License

MIT — see [LICENSE](LICENSE).

Third-party deps and their licenses are tracked in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). All bundled deps
are permissively licensed (BSD / MIT / PSF); none are copyleft.

## Contributing

Quantiom is a single-author project and **does not accept pull requests**;
see [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports go to
[Issues](../../issues); everything else — questions, ideas, just saying hi
— is the right fit for [Discussions](../../discussions).
