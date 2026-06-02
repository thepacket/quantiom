# Quantiom

**A browser-native research-grade quantum circuit editor, simulator,
workstation, and visualizer.**

Quantiom is a multi-tab editor over a 55-gate palette, three
simulators (pure-TypeScript `Float64Array` statevector ≤ 20 qubits,
Aaronson–Gottesman tableau ≤ 1024 qubits with **Pauli frame tracking
for depolarising noise**, and a quantum-trajectory noise simulator
with calibrated NISQ channels), and a column of researcher-grade
panels. The Expectation panel evaluates either a single Pauli string
or a **full weighted Pauli-sum Hamiltonian**; an Adam optimiser
gradient-descends ⟨H⟩ for VQE/QAOA/QML loops; landscape sweep,
barren-plateau diagnostic, and zero-noise extrapolation close the
NISQ research loop. A one-click **Compile…** pipeline runs
Transpile → Optimise → Route → Optimise to a target native gate set,
reporting per-stage gate counts. The Hamiltonian panel emits **Trotter
circuits at order 1 / 2 (Strang) / 4 (Suzuki) or QDrift** random
compilation. Process tomography reconstructs the χ matrix in heatmap
or Hinton view; equivalence-checking compares two open tabs with
process fidelity and trace distance. Noise is per-gate-id, per-qubit,
T1 / T2, crosstalk, custom Kraus, readout — all importable from IBM
`BackendProperties` JSON (T1, T2, per-gate gate_error, readout error,
coupling map). **WebGPU** detection and a 1-qubit-gate compute shader
for trajectory parallelism land as a foundation. Circuits round-trip
OpenQASM 3 (and parse OpenQASM 2), export to **Qiskit · Cirq · Braket
· Q# · PyQuil · pytket**, serialize into a shareable URL hash, and
the t-animation can be recorded as a WebM video.

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
  expression evaluator, OpenQASM 3 round-trip, six SDK emitters,
  share links, noise model, autodiff optimiser, transpiler, router,
  Trotter / Hamiltonian builder, tomography, equivalence checker.
- **server/** — minimal FastAPI app whose only job is `/api/health`
  for Fly's checks and serving the built client as static files.
- **examples/** — 67 hand-written OpenQASM 3 example circuits,
  searchable.

## Editor

- **Multi-circuit tabs.** A tab strip below the header keeps multiple
  circuits open with per-tab undo history, parameter values, selected
  gate, and step-through position. Shared across tabs: the custom-gate
  palette and the noise model. Drag a pill to reorder, double-click to
  rename, × to close (confirms when dirty), + for a fresh tab,
  Duplicate to clone the active tab. ⌘/Ctrl+1..9 jumps to tab N;
  ⌘/Ctrl+T opens a new one.
- **55-gate palette** across 13 categories, with category-coloured
  borders, search box, and collapsible category groups:
  - Identity & Pauli (I, X, Y, Z)
  - Clifford + T (H, S, S†, √X, √X†, T, T†)
  - Phase & Rotation (P, RX, RY, RZ)
  - General U (U, U1, U2, U3, **`u_arb`** — arbitrary 2×2,
    **`u_arb_2`** — arbitrary 4×4)
  - Two-qubit Clifford (CX, CY, CZ, CH, C√X, C√X†, SWAP, iSWAP, DCX, ECR)
  - Controlled rotations (CRX, CRY, CRZ, CP, CU, CU1, CU3)
  - Ising / native (RXX, RYY, RZZ, RZX, XX+YY, XX−YY)
  - Three-qubit (CCX, CCZ, CSWAP, RCCX, RC3X)
  - Multi-controlled (C3X, C4X, MCX, MCP, MCU — variable arity)
  - State prep (|0⟩, |1⟩, |+⟩, |−⟩, |i⟩, |−i⟩, Initialize — arbitrary
    1-qubit amplitude tuples and basis-state labels)
  - Non-unitary (Measure Z/X/Y, Reset)
  - Control flow (if, switch, while, box)
  - Markers (barrier, delay)
- **Canvas** — unbounded qubits and columns; SVG rendering. Distinct
  visuals for CNOT ⊕, SWAP ×, measure meter, reset, state-prep,
  barrier, delay; per-category coloured gate strokes. **Hover any
  gate** for a tooltip with name, qubits, column, parameters, and any
  classical condition.
- **Drag and drop**
  - Palette → cell: place a new gate.
  - Placed gate → cell: move the whole gate; column auto-bumps on
    collision.
  - Control dot or target glyph → different qubit: stretch-gesture
    reassigns just that role.
- **Inspector** — column, controls, targets, classical bits, parameter
  expressions (free-form: `π/2`, `θ`, `2*t + π/4`, `sin(t)`); per-control
  **anti-control** toggle (●/○); compact Re/Im **matrix entry grid**
  for `u_arb` (2×2) and `u_arb_2` (4×4); per-gate **classical
  condition** picker (`fire only if c[k] == v`); **Step here** button
  freezes the simulator one column before the selected gate.
- **Step-through inspector** — slider above the canvas (⏮ ◀ ▶ ⏭)
  freezes the simulation at any column for gate-by-gate debugging;
  default "follow the end" so the sim shows the final state.
- **Custom user-defined gates** — "Save as gate" captures the current
  circuit as a reusable block; the new tile appears under a pink
  "Your gates" category in the palette. Right-click to delete.
  Persisted in localStorage.
- **Toolbar actions**
  - **Compact** — ASAP-repacks columns; pulls every gate as far left
    as it can go without collision.
  - **Append U†** — appends the inverse of the current circuit
    (reverses order, daggers each gate). Self-inverse gates pass; S↔S†
    / T↔T† / √X↔√X† / C√X↔C√X† swap; rotations negate; U(θ,φ,λ)†
    swaps & negates the angles. Measurements / state-prep / arbitrary
    matrices can't be inverted automatically and are confirmed before
    being omitted.
  - **Optimise** — peephole pass: cancel adjacent inverses, merge same-
    axis rotations (`Rz(a)·Rz(b) → Rz(a+b)`), iterate to a fixed point;
    reports rules fired.
  - **Compile…** — one-click pipeline that runs Transpile →
    Optimise → Route → Optimise for a chosen target. Skips the
    routing step when no coupling map is imported. Reports per-stage
    gate count + depth.
  - **Transpile…** — three target gate sets:
    - Clifford + T: {H, S, T, CX} with the textbook 6-CX + 7-T Toffoli.
    - IBM heavy-hex: {RZ, SX, CX} with the canonical 5-pulse U3.
    - Rigetti: {RZ, RX(±π/2), CZ}.
  - **Route** (appears when a coupling map is imported) — greedy SWAP
    router that walks the circuit, BFS-finds shortest paths on the
    coupling graph, and inserts SWAPs to satisfy connectivity.
    Reports SWAPs added and the gate-count delta.
  - **Record** (appears when `t` is a free symbol) — captures one
    period of the t-animation as a WebM video using
    `MediaRecorder` + canvas captureStream. 3 seconds at 30 fps.
  - **Select…** — popover with column range inputs and Duplicate /
    Delete buttons. Clones or removes all gates in `[from, to]`.
  - **History…** — multi-step undo / redo: "back 5/10/25/100" or
    matching forward jumps in one click.
- **Undo / redo** — Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z (or Ctrl + Y);
  100 entries; consecutive parameter or QASM edits coalesce within
  500 ms.
- **Auto-save** to `localStorage`; tabs restore on refresh.
- **File menu** — Open `.qasm`, Download `.qasm`, **Examples…**
  (typeahead search across 67 circuits), **Export…** popover
  (Qiskit / Cirq / Braket / Q# / PyQuil / pytket / SVG), Share link.
  Opening a file or example creates a new tab so your current work
  stays.
- **Dark theme** throughout.
- **Title bar** — the current circuit's name is shown centered. The
  Quantiom logo on the left shows the running build's semver, commit
  count, and short git SHA.

## Simulators

Three backends, dispatched automatically based on the circuit:

### Statevector (default)

A `Float64Array` of length `2 · 2ⁿ` with interleaved real / imaginary
parts. Gate application is in-place. No server round-trips, no GIL.

- **20-qubit cap** — 16 MB of state.
- **Unbounded gate count** — each gate is O(d · 2ⁿ) where d = 2ᵏ for a
  k-qubit gate. A 12-qubit Hadamard-on-each finishes in milliseconds.
- **Parameter expressions** — JIT-compiled with a small `new Function`
  evaluator. Greek letters (π, θ, φ, λ, γ, β, τ, α, δ, ω) and
  standard math functions (`sin`, `cos`, `tan`, `sqrt`, `exp`, `ln`)
  are recognised; everything else becomes a free variable that you
  set via the Parameters panel.
- **Mid-circuit measurement** — measurements sample an outcome from
  the qubit's marginal, project onto the matching subspace,
  renormalise, and write the bit to the classical register.
  Subsequent gates carrying a `condition` execute only when the
  matching classical bit holds the expected value. Deterministically
  seeded per (gates, params) so re-renders don't shuffle.
- **Per-column input** — `simulate()` accepts a `startIndex` so
  equivalence-checking and tomography can build the full unitary
  column by column.

### Stabilizer / Clifford fast path

Aaronson–Gottesman tableau (`arXiv:quant-ph/0406196`). Auto-detected
for Clifford-only circuits (`{H, S, S†, √X, √X†, X, Y, Z, CX, CY, CZ,
SWAP, measure, reset}`) when n > 16 — sub-threshold Clifford circuits
stay on the statevector path.

- **1024-qubit cap** — 2n × (2n+1) bytes of tableau, ≈ 2 MB at n =
  1024.
- **O(n²) per gate** — H, S, CNOT update generators in linear time.
- **Bloch from the tableau** — per-qubit GF(2) elimination on the
  stabilizer rows extracts the exact reduced single-qubit state.
- **Aaronson–Gottesman measurement** — §4.1–4.2 random/deterministic
  branching with the rowsum phase-tracking trick.
- **Stabilizer-with-noise via Pauli frame tracking** — Clifford
  circuits under depolarising noise track a Pauli frame F over n
  qubits (2n binary bits) alongside the tableau. Frame propagates
  symplectically through H / S / √X / CX / CZ / SWAP; per-gate
  depolarising rolls a uniform non-identity Pauli into F; measurement
  outcomes XOR with the x-bit on the measured qubit. QEC syndrome
  benchmarks under realistic noise run at the full 1024-qubit cap.

### Noise mode (quantum trajectories)

Opt-in. Disabled by default; switching off restores the bare
statevector path with zero overhead. When on:

- **Stochastic Pauli depolarising channels** — 1-qubit on single-qubit
  gates, 2-qubit (15 non-identity Pauli pairs) on two-qubit gates,
  per-qubit at the 2-qubit rate on larger gates.
- **Amplitude damping (T1)** and **phase damping (T2)** via
  state-conditional jump operators.
- **Crosstalk** — when a 2-qubit gate fires, every coupled neighbour
  (per the imported coupling graph) receives 1-qubit depolarising at
  the crosstalk rate. Models the spectator-qubit error researchers
  see on superconducting devices.
- **Per-gate-id rates** — `perGate?: Record<string, number>` keyed by
  IR gate id (`sx`, `x`, `cx`, `cz`, `ecr`, …). Overrides the global
  1q / 2q depolarising rates for matching gates. Real devices have
  10× different errors for sx vs cx; this captures that.
- **Readout bit-flip** at measurement.
- **Custom 1-qubit Kraus channels** — up to 4 operators entered as
  2×2 complex matrices. Applied via state-conditional sampling after
  every 1-qubit gate. Trace-preservation is the user's responsibility;
  rescaling keeps the state normalised.
- **Trajectory averaging** — runs T independent simulations (default
  256, presets up to 4 096), averages probabilities and Bloch vectors.
- **Per-qubit rate overrides** — a `perQubit` array with optional
  1-qubit depolarising / γ_AD / γ_PD / readout values shadows the
  globals per qubit.
- **IBM `BackendProperties` importer** — load a `backend.properties()
  .to_dict()` JSON snapshot and Quantiom populates per-qubit T1, T2,
  sx-error, cx-error, readout-error, plus the device's coupling map
  (extracted from `coupling_map` or inferred from the cx/cz/ecr gate
  entries). A `source` field shows up in the panel ("ibmq_kyiv @
  2026-05-12") so you know which snapshot is active.

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
    distribution and shows the empirical histogram. Presets 100,
    1 024, 8 192, 100 000, a **↻ resample** button, and the exact
    distribution overlaid as a dashed accent outline behind the
    sampled bars.
- **Bloch spheres** — one axonometric sphere per qubit with axis
  labels (`|0⟩, |1⟩, |+⟩, |−⟩, |±i⟩`), state-vector arrow, and a `|r|`
  purity readout.
- **Phase disks** — per-qubit visualisation of the off-diagonal
  ρ_q[0,1] = (r_x + i r_y) / 2 in the complex plane.
- **Expectation ⟨P⟩ / ⟨H⟩** — two observable modes:
  - **single Pauli** — per-qubit selectors, the original mode.
  - **Hamiltonian** — paste a weighted Pauli sum (same syntax as the
    Hamiltonian → Trotter panel), get ⟨H⟩ = Σ h_k ⟨P_k⟩ live, fully
    plugged into Optimise / Landscape / Plateau / ZNE.

  In noise mode the value is trajectory-averaged with a "avg of N
  trajectories" tag. The panel grows four diagnostic tools for
  parameterised circuits:
  - **Optimise** — pick which free symbols to vary, minimise or
    maximise, set steps and learning rate, choose **Adam** (default)
    or **SGD**. Quantiom runs central finite differences for the
    gradient and Adam/SGD descent in the browser, pushing optimised
    parameters back into the sliders. A loss sparkline plots ⟨P⟩ over
    the trajectory.
  - **Landscape** — for 1 or 2 picked symbols, sweep across [-π, π]
    on a 64-point line or 32×32 grid and render. 1D draws as a curve;
    2D as a diverging-colormap heatmap.
  - **Barren plateau** — sample 100 random parameter points,
    compute the central-difference gradient at each, report
    Var(∂⟨P⟩/∂θ) per symbol.
  - **ZNE** (visible when noise is on) — runs the circuit at noise
    rates ×1, ×2, ×3 (scaling depolarising / damping / readout /
    crosstalk and per-qubit overrides), linearly fits ⟨P⟩(γ), reports
    γ=0 extrapolated value.
- **Reduced density matrix** — pick a qubit subset (≤ 4), see the
  2^|S| × 2^|S| matrix and `Tr(ρ²)` purity. Default-collapsed.
- **Resources** — total gates, 1-qubit / 2-qubit / multi-qubit
  breakdown, **T-count and T-depth** (parallel T-layer count) and
  CX count, parallel depth, longest-qubit length, distinct qubits,
  free-symbol count, plus a Clifford-only flag and (when a coupling
  map is imported) a connectivity-violation count.
- **Noise model** — enable toggle; sliders for 1q depolarising, 2q
  depolarising, amplitude damping γ, phase damping γ, readout
  bit-flip, crosstalk; trajectory count with 64 / 256 / 1024 / 4096
  presets; **Import IBM BackendProperties .json** button; editable
  per-qubit rate table; **read-only per-gate-id rate table** when the
  importer populates it (sx, x, cx, ecr, etc. — each with its own
  depolarising rate); a free-form **Custom 1q Kraus channel** editor
  (up to 4 operators); **coupling-graph view** drawn as a small SVG;
  **WebGPU status chip** showing "available (Apple M3 / Apple)" or
  "unavailable (CPU only)".
- **Equivalence check** — load a comparison `.qasm` OR pick another
  open tab from a dropdown. For n ≤ 8, computes both full 2ⁿ × 2ⁿ
  unitaries column by column and compares entrywise (exact); for
  n > 8 samples 16 random basis-state columns. Reports verdict, max
  amplitude deviation, factored global phase, **process fidelity
  F = |Tr(U_A† U_B)/2ⁿ|²**, and **trace distance ≤ √(1 − F)** (Fuchs–
  van de Graaf bound).
- **Syndromes (Clifford shots)** — for Clifford-only circuits with
  measurements, click Sample to run the tableau N times and tabulate
  classical bitstring histograms. Stim-style QEC decoder benchmarks
  in a browser tab. **Noise toggle** routes shots through Pauli frame
  tracking: depolarising errors propagate as a Pauli frame F over the
  n qubits, XOR'd into measurement outcomes — QEC under realistic
  noise at the full 1024-qubit tableau cap.
- **Measurement counts** — for any circuit with measurements, samples
  N independent runs (each with Math.random as the measurement RNG)
  and tabulates the classical-register bitstring histogram — the
  dynamic-circuit equivalent of the Probabilities shots mode.
- **Process tomography (χ matrix)** — for circuits of ≤ 4 qubits,
  reconstructs the χ matrix in the Pauli basis by building the full
  unitary column by column then Pauli-decomposing β_P = Tr(P† U)/2ⁿ.
  Two views — heatmap and **Hinton diagram** (square side ∝ √|χ|;
  light = positive Re, dark = negative). Optional **noise toggle**
  routes through trajectories so the reconstructed χ approximates the
  noisy "average unitary." For n = 1 the panel reports the closest
  matching named gate and its process fidelity.
- **Hamiltonian → Trotter circuit** — paste a Pauli-sum Hamiltonian
  (e.g. `0.5 * II + 0.3 * XX - 0.2 * YZ`), pick step count and time
  step δ, generate a Trotter circuit and open it in a new tab. Each
  term decomposes the textbook way: basis change → CNOT staircase →
  Rz(2hδ) → undo. Splittings:
  - **order 1** — first-order Trotter (default).
  - **order 2** — symmetric Strang splitting (forward sweep at δ/2 +
    reverse sweep at δ/2; halves leading-order error at 2× gate count).
  - **order 4** — Suzuki (nested 5× second-order with α = 1/(4 − 4^⅓)
    coefficients; chemistry gold standard).
  - **QDrift** — stochastic compiler (Campbell 2019): per step,
    sample N terms proportional to |h_k|, each emitted as a Rz with
    angle 2λδ/N. Every Generate emits a different circuit.
  
  Presets for TFIM, XXZ, H₂, Heisenberg.
- **OpenQASM 3** — editable textarea with line numbers. Edits
  debounce-parse and replace the circuit IR on every successful parse;
  failures surface inline with line numbers. Round-trips cleanly with
  the canvas, including anti-controls via `negctrl @` modifier chains
  and conditional gates via `if (c[k] == v) …` wrappers. Multi-
  statement lines split correctly. OpenQASM 2 (`qreg` / `creg` /
  `include "qelib1.inc"`) parses transparently.

Each panel is wrapped in its own React error boundary; a render-phase
crash in one panel does not break the others.

## Researcher workflows

- **VQE / QAOA / QML loops**: paste a Hamiltonian (or build an ansatz
  on the canvas), switch Expectation to **Hamiltonian mode** and
  paste the same Pauli sum, click Optimise — ⟨H⟩ = Σ h_k ⟨P_k⟩
  descends end-to-end. Plateau and Landscape sub-tools warn about
  un-trainable initialisations.
- **Calibrated noise comparison**: import an IBM `BackendProperties`
  snapshot, run a circuit, compare against actual hardware output.
- **Zero-noise extrapolation**: with noise on, click ZNE to run at
  three rates and read the noise-free estimate.
- **QEC decoder benchmarks**: build a stabilizer code with ancillas,
  add a syndrome-extraction sequence, sample 10 k shots on the
  Clifford path — up to ~1 000 qubits. **With noise enabled, the
  Pauli frame tracker injects depolarising errors at the same rates
  as the statevector noise path.**
- **Compiler / equivalence research**: rewrite via Optimise, then
  Transpile, then Route; compare the result to the original with
  Equivalence check across two tabs. Process fidelity reports the
  exact cost of each pass.
- **Dynamic circuits**: mid-circuit measurement + classical
  conditioning works end-to-end (teleportation with feedback,
  repeat-until-success, adaptive QEC). Measurement counts panel gives
  the bitstring histogram per the textbook.
- **Process tomography**: reconstruct χ for any ≤ 4-qubit subroutine,
  toggle noise on, switch between heatmap and Hinton view.
- **Notebook export**: Download to **Qiskit, Cirq, Braket, Q#,
  PyQuil, or pytket** — full Python script with parameter declarations,
  ready to paste into a Jupyter cell.
- **Collaboration**: **Share** copies a URL with the entire circuit
  encoded in the hash fragment. Hashes never hit the server. Paste
  in chat; recipient sees your circuit instantly.
- **Animation export**: when `t` is a free parameter, **Record** dumps
  one period as a 3-second WebM video — paper / slide-ready.
- **Resource estimation**: read T-count, T-depth, CX count,
  parallel depth, connectivity-violation count straight from the IR.

## Examples

The Examples picker is a typeahead search across 67 hand-written
circuits in 8 categories:

- **Intro** — coin flip, Walsh–Hadamard, magic state.
- **Entanglement** — Bell, GHZ (incl. 8q / 12q / 16q), W state, linear
  cluster, phased Schrödinger cat.
- **Protocols** — teleportation (static + **dynamic with classical
  feedback**), entanglement swapping, superdense coding, phase
  kickback, CHSH, BB84, **repeat-until-success**.
- **Algorithms** — Deutsch (1-bit), Deutsch–Jozsa (incl. 6q),
  Bernstein–Vazirani (6q, 8q), Simon, Grover (1, 2, 4q, 5q),
  QFT (5q, 8q), inverse QFT, QPE, amplitude amplification, Hadamard
  cascade 8 / 12 / 16q, quantum-walk step.
- **Arithmetic & ECC** — half adder, Cuccaro 3+3-bit adder, bit-flip
  code, Steane [[7,1,3]] encoder, 5-qubit perfect code.
- **Hamiltonian dynamics** — Ising-6 Trotter, XY-4 Trotter.
- **Decompositions** — Toffoli → Clifford + T.
- **Variational** — QAOA triangle / kite / **square depth-2**,
  hardware-efficient 2-layer / 6-layer, **Real Amplitudes**,
  **UCCSD-lite**.
- **Animation** — Rabi + Larmor, QFT of evolving state, phase
  fountain, Ising Trotter, multi-frequency cascade, dense swirl
  (deep-swirl-8 with ~100 gates).

## Interoperability

- **OpenQASM 3** round-trip with anti-controls (`negctrl @`),
  conditional gates (`if (c[k] == v) …`), the `ctrl(n) @` modifier
  chain, and multi-statement lines.
- **OpenQASM 2** import — `qreg` / `creg` / `include "qelib1.inc"` /
  `OPENQASM 2.0;` all parse via the QASM 3 parser's compatibility
  paths.
- **Six SDK code exports** for the dominant ecosystems:
  - **Qiskit** Python — IBM
  - **Cirq** — Google
  - **Amazon Braket** SDK — AWS
  - **Q#** — Microsoft
  - **PyQuil** — Rigetti
  - **pytket** — Quantinuum
  Each walks the same IR with target-specific syntax. Free symbols
  carry through as named parameters so a Quantiom ansatz lands as a
  parameterised circuit on the other side.
- **Share link** — full circuit IR → JSON → gzip → base64url → URL
  hash fragment. Zero server cost; hashes never hit the wire.
- **SVG export** of the canvas with embedded gate CSS and dark theme,
  for papers and slides.
- **WebM video export** of the t-animation (canvas captureStream +
  MediaRecorder, VP9 / VP8 fallback, default 3 s at 30 fps).

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
