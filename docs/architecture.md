# Architecture

A map of where things live and how they connect. Read this before
making non-trivial changes; pair it with [CLAUDE.md](../CLAUDE.md) for
product-level constraints (what's deliberately *not* in scope and why).

If you just want to use Quantiom, see [tutorial.md](tutorial.md) and
[panels.md](panels.md) instead.

---

## The 30-second picture

Quantiom is a pure-browser app. The Python server is a static-file
host with a `/api/health` endpoint and nothing else; the entire
simulator, optimiser, transpiler, parser, and noise model run in
TypeScript on a `Float64Array`. There is no server-side compute.

The user edits a circuit IR (an array of `PlacedGate` records). On
every edit, the editor calls `simulate(circuit)` and a shared
`SimResult` flows to every panel. Panels pull what they need from
it (amplitudes, probabilities, Bloch vectors, etc.) and short-circuit
their compute when collapsed.

```
        ┌─────────────────────────────────────────────────┐
        │            client/ (Vite + React + TS)           │
        │                                                  │
        │  editor/    ←→   sim/       ←→   panels/         │
        │   IR, tabs,      simulate +      ~40 panels,     │
        │   undo, DnD,     stabilizer +    each pure       │
        │   QASM round-    noisy traj +    function of     │
        │   trip glue,     WebGPU paths    SimResult       │
        │   docs modal                                     │
        │                                                  │
        │  qasm/  ← OpenQASM 3 parse/emit, 8 SDK emitters  │
        └─────────────────────────────────────────────────┘
                                ↑
                                │ static files
                                │
                        ┌───────┴────────┐
                        │ server/ (Py)   │
                        │ FastAPI        │
                        │ /api/health    │
                        └────────────────┘
```

---

## Directory layout

```
client/src/
  editor/       circuit IR, undo, tabs, drag-and-drop, custom gates,
                share links, recorder, docs modal, the main editor shell
  sim/          the simulator core (this is the brain)
  qasm/         OpenQASM 3 parse + emit + eight SDK / LaTeX emitters
  panels/       ~40 collapsible peer panels (24 visualisers)
  styles.css    all styles in one file
server/         FastAPI shell — static host + health endpoint
examples/       88 .qasm files in 10 categories, imported via Vite ?raw
docs/           markdown bundled into the in-app Help → Tutorial /
                Help → Panel reference modal
```

---

## The simulation core (`client/src/sim/`)

### State representation

The dense state vector is a `Float64Array` of length `2 · 2ⁿ`,
interleaved real/imaginary at even/odd indices. Qubit 0 is the
**MSB** of the basis index — big-endian throughout. Hard cap at
`MAX_QUBITS = 20`; allocating 21 qubits would request 32 MB and
defeat the responsiveness guarantee.

The stabilizer fast path uses a separate representation (Aaronson-
Gottesman tableau) with its own `MAX_QUBITS_STABILIZER = 1024`.

### Entry point — `simulate.ts`

`simulate(circuit, paramValues, customGates, options?)` is the only
function any caller uses. Inside, it picks one of three paths:

```
                              ┌─────────────────────┐
                              │  simulate(circuit)  │
                              └──────────┬──────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
  isStabilizerOnly &&             default path                  options.noise = on
  numQubits > 16                                                     │
        │                                │                            │
        ▼                                ▼                            ▼
  stabilizer.ts                    apply.ts on              simulateNoisy.ts
  Aaronson-Gottesman               Float64Array              trajectory
  tableau §4                       O(d · 2ⁿ) per             simulator
  measureZ §4.1-4.2                gate                      with stochastic
  Pauli frame for                                            Pauli + amp/phase
  noisy Cliffords                                            damp + crosstalk
```

The router into stabilizer is conservative: every gate must be in
the Clifford set *and* the circuit must be wide enough that the
1024-qubit cap actually buys something. Anything outside the gate
set (T, rotations, arbitrary unitary, …) falls through to the
default path.

The noisy path is the trajectory simulator. With `noise` on, each
shot runs an independent stochastic sample; panels average over
`noise.trajectories` shots. Density matrices are not materialised
— 4ⁿ memory caps n at ~10 and trajectories already give you what
you need.

### WebGPU foundation (`webgpuTraj.ts`)

The compute shader runs T independent 1q-only depolarising-noise
trajectories in parallel; the API is `tryRunWebGPUTrajectories(...)`
plus `isWebGPUAvailable()` for the UI status chip. **Wired into**:
Probabilities + Bloch + single-Pauli expectations + Pauli-sum
(K-batched) expectations, and the Optimise / Landscape / Plateau / ZNE
parameter sweeps in `optimize.ts` — those four loops are now async and
route each noisy evaluation through this path (with CPU fallback when
the circuit doesn't fit the supported subset).

### What lives in `sim/`

```
sim/complex.ts          Complex-number helpers ([re, im] tuples for matrices)
sim/expr.ts             Parameter expression evaluator (Greek glyphs ↔ ASCII,
                        JIT via new Function); free vars become Parameters
                        panel sliders
sim/matrices.ts         Numeric gate matrices for the 64-gate catalog,
                        controlled() for n-controlled forms, u_arb / u_arb_2
                        for arbitrary 2×2 / 4×4 unitaries
sim/apply.ts            Generic k-qubit gate application, O(d · 2ⁿ) per gate
sim/simulate.ts         Top-level entry; routes between paths
sim/stabilizer.ts       Tableau simulator + noisy Clifford via Pauli frame +
                        sampleSyndromes() + multi-qubit ⟨P⟩ via g-function
sim/simulateNoisy.ts    Trajectory simulator (Pauli + amp/phase damp +
                        crosstalk + user-defined Kraus); noisyPauliExpectation
sim/noise.ts            NoiseModel shape + IBM backend importer + custom
                        Kraus persistence + perGate overrides
sim/measure.ts          measureZ/X/Y + reset + mulberry32 + fnv1a; the seeded
                        RNG keeps outcomes stable across re-renders
sim/measurementShots.ts Per-tick classical-register histogram for dynamic
                        circuits
sim/expectation.ts      Single Pauli + Pauli-sum H = Σ h_k P_k via in-place
                        gate application + inner product
sim/density.ts          Reduced density matrix via partial trace
sim/sample.ts           Shot sampling from a probability distribution
                        (cumulative CDF + binary search)
sim/resources.ts        Gate count, T-count, T-depth, CX count, parallel
                        depth, free-symbol count
sim/optimize.ts         Parameter-shift gradient descent (SGD + Adam) +
                        ZNE linear fit + landscape grid + barren-plateau
                        gradient-variance diagnostic
sim/optimisePasses.ts   Peephole rewriter with outer fixed-point loop
                        (self-inverse, dagger-pair, rotation-merge,
                        Pauli-collapse, power-merge, HPH sandwich,
                        CX-conjugation cancellation, 3-CX → SWAP,
                        iSWAP², T-conjugation through CX, DCX³ → I)
sim/equivalence.ts      Full-unitary (n ≤ 8) or sampled-column (n > 8)
                        equivalence + process fidelity + trace distance
sim/kak.ts              Cartan KAK decomposition of a 4×4 unitary
                        (faithful Cirq magic-basis port); never throws
sim/transpile.ts        Three native targets: Clifford+T, IBM heavy-hex,
                        Rigetti. Arbitrary 2q gates KAK-decomposed on
                        the IBM/Rigetti (continuous-rotation) targets
sim/router.ts           Greedy SWAP router on a coupling map
sim/tomography.ts       Process tomography (n ≤ 4) — Pauli decomposition,
                        χ-matrix construction, optional noise mode
sim/trotter.ts          Pauli-sum parser + Trotter circuit builder
                        (orders 1 / 2 / 4 / qDRIFT)
sim/compile.ts          Transpile → Optimise → Route → Optimise pipeline
sim/webgpuTraj.ts       WebGPU compute-shader path (Probabilities/Bloch/
                        Pauli expectations + the async optimise loops)
sim/entanglement.ts     von Neumann entropy, mutual-information matrix,
                        entanglement (Schmidt) spectrum
sim/correlations.ts     connected ⟨Z_iZ_j⟩ correlations
sim/spacetime.ts        per-qubit ⟨Z⟩ vs circuit column
sim/tsweep.ts           per-qubit ⟨Z⟩ vs the t clock
```

### The peephole optimiser

`optimisePasses.ts` is unusual enough to warrant its own paragraph.
It's a fixed-point rewriter: an outer loop wraps the main walker
and every post-pass, so collapses chain — `iSWAP⁴ → ∅` works,
`T⁸ → ∅` works. The post-passes are individually small (rewrite
window of 2-3 gates), and each one reports per-rule firing counts
back to the UI.

The list of rules is in CLAUDE.md and is the canonical source.
When you add a new rule, add it to the outer fixed-point loop in
`optimiseCircuit()` and to the section in CLAUDE.md.

---

## The editor (`client/src/editor/`)

### Circuit IR

`Circuit` is `{ numQubits, numClbits, gates, qubitNames?, name? }`.
`PlacedGate` is `{ id, gateId, column, controls, targets, clbits,
params, controlStates?, condition?, annotation? }`. The IR is the
single source of truth — every panel, every emitter, every export
operates on this shape.

`buildPlacedGate` in `state.ts` is the only place that mints fresh
gate records from `(gateId, column, qubits, clbits)`. Everywhere
else, treat `PlacedGate` as immutable.

### Undo / redo

`state.ts` is a reducer with versioned history. Action types live
in `HistoryAction`; the main ones are `place-gate`, `remove-gate`,
`move-gate`, `reassign-qubit`, `replace-circuit`, `compact-columns`,
`delete-range`, `duplicate-range`, plus the qubit/clbit and naming
actions. Consecutive same-kind keystrokes coalesce into one history
entry so the undo stack stays meaningful.

### Tabs (`tabs.ts`)

One reducer manages `{ tabs, activeId }` with per-tab versioned
history + per-tab UI state (selected gate id, picked step, parameter
values). Storage key `quantiom:tabs:v1`, with migration from the
legacy `quantiom:circuit:v1`. The `TabStrip` component renders the
pills.

### Other editor modules

- `customGates.ts` — user-defined custom gate blocks;
  `expandCustomGates` inlines references at simulate time. Storage
  key `quantiom:custom-gates:v1`.
- `shareLink.ts` — gzip + base64url URL-hash encoding of the
  circuit IR. Updates the address bar in place.
- `inverse.ts` — per-gate dagger rules; powers the "Append U†"
  Transform entry.
- `recordAnimation.ts` — DOM-element recorder: clones a subtree
  into an SVG `<foreignObject>` with same-origin CSS inlined,
  paints each frame to a capture canvas, encodes via MediaRecorder.
  The Record button captures `.editor__right` (the whole right
  panel column) as `t` sweeps.
- `Markdown.tsx` — small in-house markdown + LaTeX (KaTeX) formatter,
  no runtime dep. Shared by `DocsModal` and the AI chat panel.
- `DocsModal.tsx` — in-app modal that renders the four `docs/*.md`
  files (panels, tutorial, architecture, qasm) through `Markdown`.
- `AboutModal.tsx` — toolbar **About** dialog: name, version, GitHub
  link, authorship, MIT copyright.
- `CircuitEditor.tsx` — the main editor shell. Top toolbar, tab
  strip, canvas, inspector, right-panel column. The toolbar's File
  / Edit / Help dropdown components + the About button live here.
- `CircuitCanvas.tsx` — the SVG canvas. Hosts the gate rendering
  layer (SVG) plus a transparent `.canvas__cells` HTML overlay
  that owns drag-and-drop (the HTML DnD API doesn't play nicely
  with SVG). Per-gate move handles and per-qubit reassign handles
  sit above the cells overlay. The drag-rectangle gate selection
  attaches its mousedown handler to the outer `.canvas` div so it
  catches bubbled events through the cells overlay.

---

## Panels (`client/src/panels/`)

Every panel is wrapped in `<PanelShell>`, which publishes its
collapsed state via `usePanelCollapsed()`. Expensive `useMemo`
bodies inside a panel short-circuit when collapsed. The shared
`SimResult` returned by `simulate()` exposes `amplitudes`,
`probabilities`, `blochVectors` as **lazy getters** — they compute
on first access and memoise — so a panel that doesn't read a field
costs nothing.

This is the heart of the **default-fast invariant**: a circuit
with no measurements, no parameters, no Clifford-only fast path,
and every panel collapsed except (say) Statevector, is byte-
identical to the early-Tier-0 simulator on its hot path.

Each panel is a pure function of `SimResult` + its own controls.
The list — Statevector, Probabilities, Bloch, PhaseDisk,
Expectation, Density, MutualInfo, Schmidt (entanglement spectrum),
Correlations (ZZ), SpaceTime ⟨Z⟩, TSweep, LightCone (causal cone),
Noise, Resources, Equivalence, Syndromes, MeasurementCounts,
Tomography, Hamiltonian, QASM, Parameters, Compare, Chat — is in
CLAUDE.md. (The LightCone panel is unusual: it doesn't render a chart,
it drives a dimming overlay on the circuit canvas via a `coneIds`
prop.)

Panels are also responsible for their own export buttons (Copy
CSV / JSON / SVG) and for any one-click computations (Optimise,
Landscape, Plateau, ZNE on Expectation; Sample syndromes on
Syndromes; Compute χ on Tomography; Sample counts on
MeasurementCounts). Anything that runs only on user click is fine
to be expensive.

---

## OpenQASM round-trip (`client/src/qasm/`)

```
qasm/parse.ts        hand-written OpenQASM 3 parser; multi-statement
                     line split on top-level `;`, modifier chain walker
                     for `(neg)ctrl(n) @`, conditional statement support
qasm/emit.ts         OpenQASM 3 emitter; preserves symbolic parameter
                     expressions, emits `negctrl @` and `if (c[k] == v)`
qasm/emitQasm2.ts    OpenQASM 2 (legacy) — for Qiskit < 1.0
qasm/emitQiskit.ts   Qiskit Python
qasm/emitCirq.ts     Cirq (LineQubit, sympy.Symbol, decomposed U3)
qasm/emitBraket.ts   Amazon Braket SDK (FreeParameter)
qasm/emitQSharp.ts   Microsoft Q#
qasm/emitPyQuil.ts   Rigetti PyQuil
qasm/emitPytket.ts   Quantinuum pytket (half-turn angle convention)
qasm/emitQuantikz.ts LaTeX (quantikz) for papers
qasm/exportLower.ts  pre-emit decompositions for gates lacking a native
                     SDK method (r→Rz·Rx·Rz, √Y→Ry, IonQ→Rz·RXX·Rz)
```

The parser is intentionally tolerant — OpenQASM 2 files with
`qreg` / `creg` / `include "qelib1.inc"` parse correctly. The
emitter and parser are a round-trippable pair on every gate in the
catalog; if you add a gate, both ends need to know about it.

---

## The optimise → transpile → route → compile pipeline

These four stages compose via `compileForDevice()` in `compile.ts`:

```
              Optimise         Transpile           Route             Optimise
              (peephole)       (native gate set)   (coupling map)    (peephole)
input ──→ [ optimisePasses ──→ transpile.ts   ──→ router.ts    ──→ optimisePasses ] ──→ output
                                                  greedy SWAP        same pipeline
```

Each stage is independently invocable from the Transform menu. The
"Compile" entries run the whole pipeline and report per-stage
gate counts and depth.

`equivalence.ts` is the verification side — given two circuits,
either build full unitaries (n ≤ 8) or sample-and-compare 16
columns (n > 8), and report process fidelity F = `|Tr(U_A† U_B) /
2ⁿ|²` plus a trace-distance bound. The Equivalence panel uses
this; useful for confirming a Transpile / Compile result didn't
silently change semantics.

---

## Storage keys

All persistence is `localStorage`. Keys, in alphabetical order:

```
quantiom:circuit:v1          legacy single-circuit IR (migrated to tabs:v1)
quantiom:clipboard:v1        cross-tab gate-rectangle clipboard
quantiom:custom-gates:v1     user-defined custom gate library
quantiom:inspector-h         Inspector splitter height (px)
quantiom:noise:v2            noise model (T1/T2, gates, coupling, Kraus)
quantiom:panel-collapsed:v1  which panels are open / closed
quantiom:probabilities-mode  "exact" or "shots" toggle
quantiom:probabilities-shots N shots when in shots mode
quantiom:tabs:v1             multi-tab state (per-tab versioned history)
```

When you add a new persistable feature, pick the next version
suffix and write a one-direction migration (read both old + new
keys, write new only).

---

## Performance invariants

These are the rules every change must respect:

1. **Default-fast.** Every new feature is either user-click only,
   opt-in, or short-circuited when the circuit doesn't use it. A
   parameter-free, measurement-free, Clifford-free, noise-free
   circuit must hit a hot path that's identical to the early
   Tier-0 simulator.

2. **Collapsed panels cost zero.** `usePanelCollapsed()` is the
   pattern. Inside a `useMemo`, the first line should be `if
   (collapsed) return placeholder;`. Skipping this is a regression
   even if the panel is fast.

3. **Lazy SimResult.** Don't materialise amplitudes / probabilities
   / Bloch vectors unless someone asks for them. The `simulate()`
   return shape uses getters for this; don't replace them with
   eager fields.

4. **Three simulator paths, one entry.** New simulator behaviour
   goes through `simulate()`. Panels never call `apply.ts` or
   `stabilizer.ts` directly — they ask `simulate()` for what they
   need.

5. **Cap n properly.** `MAX_QUBITS = 20` (statevector),
   `MAX_QUBITS_STABILIZER = 1024` (tableau), n ≤ 4 (tomography),
   n ≤ 8 (full-unitary equivalence). Don't loosen these without
   a memory budget.

---

## Testing

Quantiom ships with a comprehensive automated test suite. The numeric
core — the part where correctness actually matters — is covered
thoroughly and verified against analytic ground truth.

- **Framework: Vitest** (`client/test/*.test.ts`), run in Node. **369
  tests** cover the statevector simulator (Bell / GHZ / rotations /
  measurement / state-prep / big-endian), every gate's matrix unitarity
  and algebraic identities, the parameter evaluator, the Clifford
  tableau (cross-checked against the statevector), Pauli expectations,
  resource counting, circuit equivalence, gate inversion (U†·U = I), the
  OpenQASM 3 round-trip, **all eight SDK / LaTeX emitters**, the
  transpiler / router / Trotter builder, the noisy trajectory simulator,
  the optimiser, the KAK decomposition, and all 24 visualiser
  substrates.
- **Continuous integration.** `.github/workflows/ci.yml` type-checks
  the source and the tests, runs the full suite, and builds the client
  on **every push and pull request**. A green build means all 369 tests
  passed.
- **In-app live Self-test.** The toolbar **Self-test** button runs a
  **344-check** browser-side cross-section of the same engine the
  session is using (`client/src/selftest/diagnostics.ts`), against
  known-correct results, and reports pass/fail in ~10 ms — so a user can
  validate the engine in their own browser without taking "it's tested"
  on faith. It's a lazily-imported chunk: zero cost until the dialog is
  opened.
- **Commands.** `npm test` (CI mode), `npm run test:watch`,
  `npm run test:coverage`, `npm run typecheck:test`. The lockfile is
  pinned to npm 10 (see `CLAUDE.md`) so the suite installs identically
  in CI and Docker.

The suite has already earned its keep: its first run surfaced two real
correctness bugs — a false-positive in the equivalence checker (circuits
with disjoint basis images reported as equivalent) and two gates
mislabelled as self-inverse in the inverter — both now fixed and
regression-tested.

## Out of scope

Out-of-scope features and why they were rejected live in
[CLAUDE.md](../CLAUDE.md) — sympy / Pyodide, Sonorizer, Q-sphere,
in-tool tutorials, density-matrix mode, general WebGPU statevector,
real hardware backends, pulse-level, CV / qudits / topological /
networks, MPS / tensor networks, Solovay-Kitaev. Don't propose
these.

When in doubt, check CLAUDE.md before opening a new direction.
