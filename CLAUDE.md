# Quantiom — notes for Claude

## What this is

Quantum-computing circuit editor, simulator, and visualizer aimed at
users **already comfortable with QC concepts**. A serious tool, not a
vulgarizer. IBM Quantum Composer is the floor.

## Product principles

- **Editor-first.** No tutorial system. The "educator" facet is rich
  inline math and formal derivations alongside what the user builds —
  not guided lesson paths.
- **Don't simplify the editor to accommodate beginners.** Advanced
  features are expected: arbitrary-angle rotations, custom gates,
  arbitrary unitary matrices, classical registers, mid-circuit
  measurement, conditional gates, anti-controls, barriers, subroutines,
  OpenQASM 3 round-trip.
- **Visualizers are peer panels**, not the headline. Same update cadence
  and screen-space rights as statevector / probabilities / Bloch.
- **Default state must be fast.** Disabled or collapsed features must
  cost nothing per frame. Noise mode, autodiff optimisation, equivalence
  checks, syndrome sampling — all opt-in, all zero-cost when the user
  isn't using them.
- **Browser-native, research-grade.** No install, no account. Real
  hardware integration is out of scope for the in-browser tool — Qiskit
  export covers the "I want to run this on a QPU" path.

## Architecture (current)

Everything runs in the browser. The Python server is just a static
host plus `/api/health`.

- `client/` — Vite + React + TypeScript. UI, all three simulators,
  parameter expression evaluator, OpenQASM 3 round-trip, Qiskit
  codegen, share links, noise model, autodiff optimiser, equivalence
  checker.
- `client/src/sim/` — the simulator core.
  - `complex.ts`: Complex helpers (`[re, im]` tuples for matrices).
  - `expr.ts`: parameter expression evaluator. Greek glyphs map to
    ASCII names; `new Function` JIT-compiles the rest. Free variables
    become sliders in the Parameters panel.
  - `matrices.ts`: numeric gate matrices for the 55-gate catalog plus
    `controlled()` for n-controlled forms; includes `u_arb` (2×2) and
    `u_arb_2` (4×4) arbitrary unitaries.
  - `apply.ts`: generic k-qubit gate application on a `Float64Array`
    state with interleaved re/im. O(d · 2ⁿ) per gate.
  - `simulate.ts`: top-level `simulate(circuit, paramValues,
    customGates, options?)`. Cap `MAX_QUBITS = 20`. Routes Clifford-only
    circuits (n > 16) to the tableau path. Optional `startIndex` for
    computing per-column unitary actions (used by the equivalence checker).
  - `stabilizer.ts`: Aaronson-Gottesman tableau simulator. H/S/CX
    rules follow §4 of `arXiv:quant-ph/0406196` verbatim; X/Y/Z/CZ/CY/
    SWAP/√X/√X† compose from those. Cap `MAX_QUBITS_STABILIZER = 1024`.
    `measureZ` implements §4.1–4.2 with rowsum phase tracking.
    `sampleSyndromes` runs N shots for the Syndromes panel.
  - `simulateNoisy.ts`: trajectory simulator with stochastic Pauli
    depolarising + amplitude/phase damping. Per-trajectory measurement
    sampling. `noisyPauliExpectation` re-runs trajectories for the
    Expectation panel's averaged ⟨P⟩.
  - `noise.ts`: `NoiseModel` shape + `loadNoise/saveNoise` (storage
    key `quantiom:noise:v2`) + `rateFor(model, kind, q)` per-qubit
    lookup + `importIbmBackend(jsonString)`.
  - `measure.ts`: `measureZ/X/Y`, `reset`, `mulberry32`, `fnv1a`. The
    seeded RNG keeps measurement outcomes stable across re-renders.
  - `expectation.ts`: Pauli expectations via in-place gate application
    + inner product.
  - `density.ts`: reduced density matrix via partial trace.
  - `sample.ts`: shot sampling from a probability distribution.
  - `resources.ts`: gate-count breakdown, T-count, parallel depth,
    distinct qubits, free-symbol count.
  - `optimize.ts`: parameter-shift gradient descent on the Expectation
    panel. Central finite differences + plain SGD.
  - `equivalence.ts`: full-unitary (n ≤ 8) or sampled-column (n > 8)
    comparison between two circuits, factoring out global phase.
- `client/src/qasm/`
  - `emit.ts`: OpenQASM 3 emitter. Emits `negctrl @` chains for
    anti-controls and `if (c[k] == v) …` wrappers for conditional gates.
  - `parse.ts`: hand-written parser. Modifier-chain walker handles
    `(neg)ctrl(n) @ …`. Multi-statement lines split on top-level `;`.
  - `emitQiskit.ts`: Qiskit Python codegen. Walks the same IR.
- `client/src/editor/`
  - `state.ts`: undo/redo reducer with consecutive-keystroke coalescing.
  - `shareLink.ts`: gzip + base64url URL-hash encoding for the circuit IR.
  - `customGates.ts`: user-defined custom gate blocks; `expandCustomGates`
    inlines references at simulate time.
- `server/` — FastAPI shell: `/api/health` + static-file mount.
- `examples/` — 62 hand-written OpenQASM 3 example circuits imported
  into the client via Vite `?raw`.

## Conventions

- TypeScript strict.
- Big-endian basis: qubit 0 is the MSB of basis index.
- The Float64Array state has `re` at even indices and `im` at odd;
  size is `2 · 2ⁿ`.
- Greek letter ↔ ASCII map in `expr.ts` matches the inspector's display
  function in [client/src/panels/ParameterPanel.tsx](client/src/panels/ParameterPanel.tsx).
- The OpenQASM 3 emitter/parser pair preserves the symbolic look of the
  parameter expressions; it does not evaluate them.
- **Circuit name** is an optional field on the IR (`Circuit.name`).
  Set by the FileMenu when a circuit is loaded (example label or file
  basename) and rendered in the centre of the app header. Manual edits
  preserve the name; Clear leaves it undefined ("Untitled").
- **Version** in the header is built from `package.json` semver plus
  `__GIT_COMMITS__` and the short `__GIT_SHA__` injected at build time
  via `vite.config.ts`. The Dockerfile installs git and copies `.git`
  in so this works inside the production image.
- **Probabilities panel** has two modes — `exact` (truth) and `shots`
  (sampled). The sampler is in [client/src/sim/sample.ts](client/src/sim/sample.ts);
  it normalises the exact probabilities, builds a cumulative
  distribution, and binary-searches per shot. Mode and shot count
  persist in localStorage. Real hardware always behaves like `shots`.
- **Default-fast invariant**: every new feature must either run only on
  user click (Optimise, Compare, Sample syndromes), be opt-in (Noise
  toggle), or short-circuit when the circuit doesn't use the feature
  (measurement / condition allocations only when present; stabilizer
  routing only when Clifford-only + n > 16). The bare gate-application
  hot path on a Clifford-free, measurement-free, parameter-free circuit
  is byte-identical to the early-Tier-0 version.
- **Panel collapse propagation**: `PanelShell` publishes its collapsed
  state via `usePanelCollapsed()`; expensive `useMemo` bodies
  short-circuit when collapsed. `SimResult` exposes `amplitudes`,
  `probabilities`, `blochVectors` as lazy getters that compute on first
  access and memoise.
- **Storage keys**: `quantiom:circuit:v1`, `quantiom:custom-gates:v1`,
  `quantiom:noise:v2`, `quantiom:panel-collapsed:v1`,
  `quantiom:probabilities-mode`, `quantiom:probabilities-shots`.

## Things not to propose

- **Sympy / Pyodide / server-side symbolic algebra.** The original
  sympy server-side path was tried, fought for half the project, and
  ripped out. See `feedback_client_side_simulator` memory.
- **Sonorizer.** Built, shipped, explicitly removed as "useless,
  uninteresting." Don't bring it back.
- **Q-sphere.** Tried, rejected as "too large then not required."
- **In-tool tutorials, guided lessons.** Editor-first; the example
  library is the education.
- **Density-matrix mode beyond what trajectories give.** 4ⁿ memory
  caps n at ~10 for no extra scientific value over trajectories.
- **GPU / WebGPU.** Engineering effort vs the n ≤ 20 ceiling doesn't
  pencil; researchers needing GPU go to qsim/cuQuantum. The Clifford
  fast path covers the "big n" niche.
- **Real hardware backend.** Multi-week vendor integration (auth,
  queue, billing). The Qiskit Python export covers the "I want to run
  on a QPU" workflow.

## Earlier architecture (gone)

For history: the simulator used to run server-side with sympy. That
was removed in favor of a pure-TS `Float64Array` simulator because
sympy's GIL blocked animation frames, a 6-qubit 35-gate symbolic
circuit produced ~22 MB of LaTeX and took 32 s to render, and the
numeric panel path never needed symbolic at all.

If symbolic display is ever needed, the right path is the OpenQASM 3
view (already round-trippable) or a separate offline tool.
