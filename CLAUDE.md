# Quantiom — notes for Claude

## What this is

Quantum-computing circuit editor, simulator, workstation, and
visualizer aimed at users **already comfortable with QC concepts**.
A serious tool, not a vulgarizer. IBM Quantum Composer is the floor.

## Product principles

- **Editor-first.** No tutorial system. The "educator" facet is rich
  inline math and formal derivations alongside what the user builds —
  not guided lesson paths.
- **Don't simplify the editor to accommodate beginners.** Advanced
  features are expected: arbitrary-angle rotations, arbitrary unitary
  matrices, custom gates, classical registers, mid-circuit
  measurement, conditional gates, anti-controls, barriers,
  subroutines, multi-circuit tabs, OpenQASM 3 round-trip, six SDK
  exports, transpilation, routing, Trotter circuit synthesis, ZNE,
  process tomography.
- **Visualizers are peer panels**, not the headline. Same update
  cadence and screen-space rights as statevector / probabilities /
  Bloch.
- **Default state must be fast.** Disabled or collapsed features must
  cost nothing per frame. Noise mode, optimisation diagnostics,
  equivalence checks, syndrome sampling, transpile / route / record —
  all opt-in, all zero-cost when the user isn't using them.
- **Browser-native, research-grade.** No install, no account. Real
  hardware integration is out of scope for the in-browser tool — the
  six code exports cover the "I want to run this on a QPU" path.

## Architecture (current)

Everything runs in the browser. The Python server is just a static
host plus `/api/health`.

- `client/` — Vite + React + TypeScript. Multi-tab editor, three
  simulators, parameter expression evaluator, OpenQASM 3 round-trip,
  six SDK emitters, share links, noise model (incl. T1/T2, crosstalk,
  custom Kraus, IBM importer), Adam optimiser, ZNE / landscape /
  barren-plateau diagnostics, peephole optimisation passes,
  transpiler, greedy SWAP router, Hamiltonian → Trotter builder,
  process tomography with Hinton view, equivalence checker, WebM
  recorder.
- `client/src/sim/` — the simulator core.
  - `complex.ts`: Complex helpers (`[re, im]` tuples for matrices).
  - `expr.ts`: parameter expression evaluator. Greek glyphs map to
    ASCII names; `new Function` JIT-compiles the rest. Free variables
    become sliders in the Parameters panel.
  - `matrices.ts`: numeric gate matrices for the 64-gate catalog plus
    `controlled()` for n-controlled forms; includes `u_arb` (2×2) and
    `u_arb_2` (4×4) arbitrary unitaries, and the hardware-native /
    completeness set `M_R(θ,φ)` (equatorial-axis rotation), `M_FSIM`
    (Google native), `M_SY`/`M_SYdg` (√Y), `M_SQRTSWAP`/`M_SQRTSWAPdg`,
    and the IonQ native trio `M_GPI`/`M_GPI2`/`M_MS` (Braket emits these
    natively; the others decompose via `exportLower`).
  - `qasm/exportLower.ts`: pre-emit lowering so the six SDK emitters
    export the gates without a native method as exact decompositions —
    `r(θ,φ)→Rz(−φ)·Rx(θ)·Rz(φ)`, `√Y→Ry(π/2)` (global phase dropped).
    Each emitter calls it first; fSim/√SWAP fall through to a native
    form (Cirq has both) or a graceful comment.
  - `apply.ts`: generic k-qubit gate application on a `Float64Array`
    state with interleaved re/im. O(d · 2ⁿ) per gate.
  - `simulate.ts`: top-level `simulate(circuit, paramValues,
    customGates, options?)`. Cap `MAX_QUBITS = 20`. Routes
    Clifford-only circuits (n > 16) to the tableau path. Optional
    `startIndex` for computing per-column unitary actions (used by
    equivalence checker, tomography); optional `rng` to override the
    deterministic seed for measurement sampling (used by measurement-
    shots). Implements the `initialize(state)` gate (basis-state
    labels and amplitude tuples like `(1/sqrt(2), 0, cos(t), sin(t))`).
  - `stabilizer.ts`: Aaronson-Gottesman tableau simulator. H/S/CX
    rules follow §4 of `arXiv:quant-ph/0406196` verbatim;
    X/Y/Z/CZ/CY/SWAP/√X/√X† compose from those. Cap
    `MAX_QUBITS_STABILIZER = 1024`. `measureZ` implements §4.1–4.2
    with rowsum phase tracking. `sampleSyndromes(n, gates, numClbits,
    shots, noise?)` runs N shots; with `noise`, routes through
    `runCliffordNoisy` which tracks a Pauli frame F (2n binary bits)
    propagated symplectically through Cliffords with per-gate
    depolarising error injection.
  - `simulateNoisy.ts`: trajectory simulator with stochastic Pauli
    depolarising + amplitude/phase damping + crosstalk + user-defined
    Kraus channels. Per-trajectory measurement sampling.
    `noisyPauliExpectation` re-runs trajectories for the Expectation
    panel's averaged ⟨P⟩. Optional `startIndex` (mirroring `simulate`)
    used by noisy tomography.
  - `noise.ts`: `NoiseModel` shape + `loadNoise/saveNoise` (storage
    key `quantiom:noise:v2`) + `rateFor(model, kind, q)` per-qubit
    lookup + `importIbmBackend(jsonString)` (extracts T1/T2/sx
    err/cx err/readout/coupling map AND per-gate-id error rates by
    bucketing gate_error entries by gate name with median aggregation;
    converts T1/T2 to per-gate damping via the median sx gate length).
    Custom Kraus operators persisted as numeric float arrays.
    `NoiseModel.perGate?: Record<string, number>` overrides depolarising
    rates per IR gate id.
  - `measure.ts`: `measureZ/X/Y`, `reset`, `mulberry32`, `fnv1a`. The
    seeded RNG keeps measurement outcomes stable across re-renders.
  - `measurementShots.ts`: `sampleMeasurementShots(circuit, ...)` —
    runs N independent simulations with Math.random for the
    measurement RNG, returns classical-register bitstring histogram.
  - `expectation.ts`: Pauli expectations via in-place gate
    application + inner product. Exports `paulis()` (single Pauli
    string), `pauliSumExpectation()` (weighted Pauli-sum H = Σ h_k P_k),
    `evaluateObservable()` (dispatches on `Observable = { kind:
    "pauli" } | { kind: "sum" }`). The Expectation panel's mode
    toggle picks between the two.
  - `density.ts`: reduced density matrix via partial trace.
  - `sample.ts`: shot sampling from a probability distribution.
  - `resources.ts`: gate-count breakdown, T-count, **T-depth**
    (distinct columns containing T/T†), CX count, parallel depth,
    distinct qubits, free-symbol count.
  - `optimize.ts`: parameter-shift gradient descent. `optimizeExpectation`
    supports Adam (default) and SGD; `zneFit` runs at ×1/×2/×3 noise
    scales and linearly fits ⟨P⟩(γ→0); `computeLandscape` sweeps
    1–2 symbols on a grid; `barrenPlateauDiagnostic` reports gradient
    variance over random parameter samples.
  - `optimisePasses.ts`: peephole rewriter with an outer fixed-point
    loop chaining the main walker + every post-pass: self-inverse
    cancellation, dagger-pair, same-axis rotation merge, Pauli
    collapse, **power-merge** (T·T → S, S·S → Z, √X·√X → X), H·CX·H
    → CZ, **H·CZ·H → CX** (graph-state basis change, either wire),
    **H·X·H → Z / H·Z·H → X / H·Y·H → Y** Hadamard-Pauli
    sandwiches, **CX-conjugation cancellation** (X(t)·CX·X(t) → CX,
    Z(c)·CX·Z(c) → CX), **3-CX → SWAP synthesis**, iSWAP·iSWAP → Z·Z,
    DCX·DCX·DCX → I. Deep
    mode adds commute-through-diagonals (rotations + T/S hop past
    Z-stabilized control of CX/CY/CCX/etc. to find merge partners
    — **T-conjugation through CX**). Reports rule counts; capped
    at 50 outer × 200 inner iterations.
  - `equivalence.ts`: full-unitary (n ≤ 8) or sampled-column (n > 8)
    comparison between two circuits, factoring out global phase. Also
    computes process fidelity F = |Tr(U_A† U_B)/2ⁿ|² and the trace-
    distance bound √(1 − F).
  - `transpile.ts`: three target gate sets — Clifford+T (textbook
    6-CX + 7-T Toffoli), IBM heavy-hex {RZ, SX, CX} (5-pulse U3),
    Rigetti {RZ, RX(±π/2), CZ}. Reports gate counts and T-count
    before/after. Arbitrary 2-qubit gates (u_arb_2, iSWAP, DCX, ECR,
    numeric RXX/RYY/RZZ) route through KAK on the continuous-rotation
    targets (IBM + Rigetti); the full list fully lowers to the native
    set (lowerEach recurses). Clifford+T leaves them skipped (arbitrary
    angles can't be exact — no Solovay-Kitaev).
  - `kak.ts`: Cartan KAK decomposition of an arbitrary 4×4 unitary
    into (A1⊗A2)·RXX·RYY·RZZ·(B1⊗B2) + global phase. Faithful port of
    Cirq's magic-basis KAK (bidiagonalize_real_matrix_pair_with_
    symmetric_products + kron_factor_4x4_to_2x2s + so4_to_magic_su2s +
    KAK_GAMMA angle extraction). `decomposeKAK4x4(U)` returns null on
    any numerical edge (try/catch; rank-deficient Re(Uₘ) handled).
    Verified at machine precision on CNOT + Haar (see
    `client/test/test-kak.test.ts`).
  - `router.ts`: greedy SWAP router. Maintains logical→physical
    mapping; for each 2q gate, BFS shortest path on coupling graph,
    inserts SWAPs to bring qubits adjacent, applies the gate, commits
    the new mapping. Plus `countConnectivityViolations` for the
    Resources panel.
  - `tomography.ts`: process tomography. Builds U column-by-column via
    `simulate`, decomposes into Pauli basis (β_P = Tr(P† U)/2ⁿ),
    forms χ = β β†. Capped at 4 qubits. Optional noise mode routes
    through `simulateNoisy` for the trajectory-averaged "average
    unitary" approximation.
  - `trotter.ts`: Pauli-sum parser and Trotter circuit builder.
    Splitting selectable via `TrotterOptions.order` (1 = first-order,
    2 = symmetric Strang, 4 = Suzuki nested with α = 1/(4 − 4^⅓))
    or `TrotterOptions.mode = "qdrift"` for Campbell 2019 random
    compilation with configurable samples per step. Each multi-qubit
    Pauli term decomposes via basis change (H/S†H/I) → CNOT staircase
    → Rz(2hδ) → undo. Presets for TFIM, XXZ, H₂, Heisenberg.
  - `compile.ts`: `compileForDevice(circuit, target, coupling)` runs
    Transpile → Optimise → Route → Optimise as one pipeline; returns
    final circuit + per-stage metrics. Toolbar "Compile…" button
    invokes it.
  - `entanglement.ts`: `vonNeumannEntropy` / `densityEigenvalues`
    (eigenvalues of a complex-Hermitian ρ via the real-symmetric
    embedding), `mutualInformationMatrix` (pairwise I(i:j)),
    `entanglementSpectrum` (Schmidt coefficients across a cut),
    `entropyProfile` (S(ρ_{[0..k]}) for every contiguous cut — area-law
    vs volume-law). Powers the entanglement panels.
  - `correlations.ts`: `zzCorrelations` — connected ⟨Z_iZ_j⟩−⟨Z_i⟩⟨Z_j⟩.
  - `spacetime.ts`: `spaceTimeZ` — per-qubit ⟨Z⟩ after each column
    (re-simulates each prefix); `spaceTimeEntropy` — per-qubit S(ρ_q)
    after each column (entanglement-growth front). `tsweep.ts`:
    `tSweepZ` — ⟨Z_q⟩(t) over one period of the `t` clock;
    `tSweepSpectrum` — real DFT of those traces (Rabi/Larmor/Floquet
    peaks).
  - `unitary.ts`: `buildUnitary` — the full 2ⁿ×2ⁿ operator column by
    column (|j⟩ → output column j), magnitude + phase, capped at 6
    qubits. Powers the unitary-heatmap panel.
  - `interaction.ts`: `interactionGraph` — per-pair count of
    multi-qubit gates (logical connectivity vs hardware coupling).
  - `pauliSpectrum.ts`: `allPauliExpectations` — all 4ⁿ ⟨P⟩ (shared
    substrate for Wigner + magic). `magic.ts`: `magic` — stabilizer
    2-Rényi entropy M₂ (0 ⟺ stabilizer state) + Pauli-weight
    distribution. `wigner.ts`: `discreteWigner` — qubit phase-space
    quasi-probability on the 2ⁿ×2ⁿ grid, negativity = non-classicality
    (n ≤ 4; note the qubit non-covariance caveat in the file header).
  - `negativity.ts`: `negativityMatrix` — pairwise log-negativity from
    the partial-transpose eigenvalues (PPT-exact for 2 qubits ⇒ E_N > 0
    iff entangled). Uses `densityEigenvaluesSigned` (the un-clamped
    variant in `entanglement.ts`).
  - `loschmidt.ts`: `loschmidtEcho` — return probability L(t) +
    DQPT rate function over the `t` clock.
  - `pauliMatrix.ts`: `pauliSparse(n, str)` — Pauli string as a
    signed/phased permutation (one entry per column). Shared by PTM +
    Hamiltonian spectrum. `ptm.ts`: `pauliTransferMatrix` — the 4ⁿ×4ⁿ
    real PTM R_{ij}=(1/2ⁿ)Tr(P_i U P_j U†) from the dense unitary
    (n ≤ 3). `hamSpectrum.ts`: `hamiltonianSpectrum(terms, n)` — exact
    eigenvalues of a Pauli-sum H via the real-symmetric embedding
    (n ≤ 6); reuses the trotter `parsePauliSum`.
  - `blochPath.ts`: `blochTrajectories` — per-qubit 3-D Bloch path over
    one `t` period. `otoc.ts`: `otoc` — out-of-time-order correlator
    C(t)=1−Re⟨W(t)V W(t)V⟩ on |0…0⟩, dense-unitary per sample (n ≤ 6).
  - `tanner.ts`: `tannerGraph` — bipartite check graph; each measurement
    is a check whose support is the backward causal cone of the measured
    qubit (reuses `editor/lightcone.computeLightCone`).
  - `qsphere.ts`: `qSphere` — basis states on a sphere (latitude =
    Hamming weight, size = |amp|, hue = phase), n ≤ 6. `husimi.ts`:
    `husimiQ` — spin coherent-state Husimi Q(θ,φ)=|⟨θ,φ|ψ⟩|² grid
    (always non-negative; complement to Wigner), n ≤ 7. `zx.ts`:
    `zxDiagram` — circuit → ZX diagram (Z/X spiders + phases, H-boxes,
    CX plain edge, CZ Hadamard edge; non-spider gates → generic boxes).
    Faithful rendering, not PyZX rewriting.
  - `webgpuTraj.ts`: WebGPU foundation. `getWebGPUDevice()` (cached),
    `isWebGPUAvailable()`, `webGPUAdapterInfo()` for the UI status
    chip. `tryRunWebGPUTrajectories(circuit, params, customGates,
    noise, T)` runs T noisy trajectories in parallel on the GPU for
    **1-qubit-gate-only circuits with depolarising noise** (no 2q,
    no T1/T2, no custom Kraus, no measurements/conditions/reset).
    FP32 throughout. WGSL compute shader; one thread per trajectory;
    pre-rolled per-(trajectory, op) randoms on CPU. Extended to emit
    per-qubit Bloch + K-batched multi-qubit Pauli expectations. The
    Optimise / Landscape / Plateau / ZNE loops in `optimize.ts` are now
    async and route each noisy evaluation through this GPU path (with
    CPU fallback), so the K× Pauli-sum speedup is live there.
- `client/src/qasm/`
  - `emit.ts`: OpenQASM 3 emitter. Emits `negctrl @` chains for
    anti-controls and `if (c[k] == v) …` wrappers for conditional
    gates.
  - `parse.ts`: hand-written parser. Modifier-chain walker handles
    `(neg)ctrl(n) @ …`. Multi-statement lines split on top-level `;`.
    Handles `if (c[k] == v) <stmt>;`. Compatible with OpenQASM 2
    (`qreg` / `creg` / `include "qelib1.inc"`).
  - `emitQiskit.ts`: Qiskit Python codegen.
  - `emitCirq.ts`: Cirq codegen (LineQubit, sympy.Symbol, decomposed U3).
  - `emitBraket.ts`: Amazon Braket SDK codegen (FreeParameter).
  - `emitQSharp.ts`: Microsoft Q# codegen.
  - `emitPyQuil.ts`: PyQuil (Rigetti) codegen.
  - `emitPytket.ts`: pytket (Quantinuum) codegen, with half-turn
    angle convention.
- `client/src/editor/`
  - `state.ts`: undo/redo reducer with consecutive-keystroke
    coalescing. Reducer actions include `compact-columns`,
    `delete-range`, `duplicate-range`, `repeat-range` (append N copies —
    ansatz/Trotter layers) and `insert-gates` (snippet blocks) for the toolbar.
  - `snippets.ts`: gate-block snippet library (Bell / GHZ / QFT / iQFT /
    Trotter-Ising layer) inserted via the Edit menu (`insert-gates`).
  - `CircuitCanvas.tsx` editor features: right-click gate **context menu**
    (Edit/Duplicate/Invert†/Add-Remove control [promotes to the controlled
    gate id x→cx,h→ch,…]/Toggle anti-control/Delete; handler on the move AND
    reassign handles), red dashed **skip rings** from `SimResult.skipped`,
    UI-only column **folding**, and CSS-transform **zoom** (40–200%, top-left
    anchored; controls ride in the StepBar row). Keyboard ⌘C/X/V on the
    selection + arrow-nudge.
  - `tabs.ts`: multi-tab state hook (`useTabs`). One reducer manages
    `{ tabs, activeId }` with per-tab versioned history + per-tab UI
    state (selected gate, picked step, paramValues). Storage key
    `quantiom:tabs:v1`; migrates legacy `quantiom:circuit:v1`. Actions
    include `tab:close-all` (`closeAllTabs` — resets to one blank tab,
    behind the File-menu **Close All** confirm).
  - `TabStrip.tsx`: pill UI for tabs; drag-to-reorder, double-click
    to rename, close button.
  - `FileMenu.tsx`: the **File** dropdown — Examples/Open/Share, the
    eight export emitters, **Save Circuit (QASM)…** (native Save-As via
    `showSaveFilePicker`, falling back to download), **Download QASM**,
    and **Close All** (custom Yes/Cancel `ConfirmDialog`, since
    `window.confirm` can't relabel its buttons). The gate palette and the
    right panel column are each whole-column collapsible (a ◂/▸ button →
    a thin reopen strip; `quantiom:palette-collapsed` /
    `quantiom:panels-collapsed`), driven by `--palette-w` / `--panels-w`
    CSS vars on `.editor` so the collapse wins at every breakpoint.
  - `shareLink.ts`: gzip + base64url URL-hash encoding for the
    circuit IR.
  - `customGates.ts`: user-defined custom gate blocks;
    `expandCustomGates` inlines references at simulate time.
  - `inverse.ts`: per-gate dagger rules; `inverseGates(circuit, lo,
    hi)` returns the reversed-and-daggered gates appended to the
    circuit. Powers the toolbar's "Append U†" button.
  - `recordAnimation.ts`: DOM-subtree → SVG `<foreignObject>` (with
    same-origin CSS inlined) → canvas → MediaRecorder pipeline. Sweeps
    `t` across [0, 2π) over N frames, dumps a WebM video. The toolbar
    Record button captures the whole `.editor__right` panel column.
  - `lightcone.ts`: `computeLightCone(circuit, target, dir)` — pure
    topological backward/forward causal cone (set of gate ids); drives
    the Causal-cone canvas dimming overlay.
- `client/src/panels/` (collapsible, persisted)
  - `StatevectorPanel`, `ProbabilityPanel`, `BlochPanel`,
    `PhaseDiskPanel`, `ExpectationPanel` (with the Optimise +
    Landscape + Plateau + ZNE tool row), `DensityPanel`, `NoisePanel`
    (incl. coupling-graph SVG view + custom Kraus editor),
    `ResourcePanel` (T-depth + CX count + connectivity violations),
    `EquivalencePanel` (file + cross-tab + F + trace distance),
    `SyndromePanel`, `MeasurementCountsPanel`, `TomographyPanel`
    (heatmap + Hinton + noise toggle), `HamiltonianPanel`,
    `QasmPanel`, `ParameterPanel`.
  - Entanglement / dynamics visualisers (all default-collapsed, capped,
    verified against known states): `MutualInfoPanel` (I(i:j) heatmap),
    `SchmidtPanel` (entanglement spectrum across a cut),
    `EntropyProfilePanel` (S(ρ_A) across every contiguous cut),
    `CorrelationPanel` (connected ⟨Z_iZ_j⟩ heatmap), `SpaceTimePanel`
    (⟨Z_q⟩ vs column), `SpaceTimeEntropyPanel` (S(ρ_q) vs column),
    `TSweepPanel` (⟨Z_q⟩(t) traces), `TSweepFFTPanel` (DFT of those
    traces), `AmplitudePhasePanel` (full-state horizontal bars: length =
    |amp|, hue = phase), `UnitaryHeatmapPanel` (2ⁿ×2ⁿ operator, mag + phase,
    n ≤ 6), `InteractionGraphPanel` (logical connectivity node-link),
    `WignerPanel` (discrete Wigner phase-space, n ≤ 4),
    `MagicPanel` (stabilizer-Rényi M₂ + Pauli-weight bars, n ≤ 6),
    `NegativityPanel` (pairwise log-negativity — genuine entanglement,
    vs MI's classical+quantum), `LoschmidtPanel` (return probability +
    DQPT rate function over `t`), `PTMPanel` (Pauli transfer matrix,
    n ≤ 3), `BlochTrajectoryPanel` (per-qubit Bloch path over `t`),
    `OtocPanel` (out-of-time-order correlator / scrambling, n ≤ 6),
    `HamSpectrumPanel` (exact Pauli-sum eigenvalues + ⟨H⟩ overlay),
    `TannerPanel` (measurement check graph), `QSpherePanel` (basis
    states on a sphere), `HusimiPanel` (spin Husimi-Q, non-negative),
    `ZXPanel` (ZX-calculus diagram), `LightConePanel` (causal-cone
    selector → canvas dimming via `CircuitCanvas` coneIds prop). The
    statevector-only ones show a notice under Clifford / noise mode.
  - Analysis / diagnostics added since (all default-collapsed, each with a
    pure tested `sim/` helper): `DecoherencePanel` (depth-stepped
    trajectory-averaged histogram → uniform; noise-mode movie),
    `SpectralFormFactorPanel` (SFF(t) dip→ramp→plateau chaos diagnostic),
    `FidelityPanel` (fidelity / trace distance / purity / S(ρ) vs the ideal;
    noise-mode), `StabilizerTableauPanel` (signed Pauli generators from the
    AG tableau; Clifford-only, past the statevector cap), `LevelStatisticsPanel`
    (Oganesyan–Huse gap ratio vs Poisson/GOE surmise), `QfiPanel` (quantum
    Fisher info F_Q = 4 Var(J_α); SQL/Heisenberg witness), `SymmetrySectorsPanel`
    (excitation-number + Z₂-parity decomposition; pure & noisy), `CoherencePanel`
    (l₁ / relative-entropy coherence; pure statevector + noisy ρ),
    `BranchTreePanel` (mid-circuit-measurement outcome tree via a self-contained
    forking simulator), `QgtPanel` (Fubini–Study metric + Berry curvature over
    free symbols — the QNG geometry), `ParticipationPanel` (IPR / PR /
    participation entropy + per-column sweep; localization), `ConcurrencePanel`
    (pairwise Wootters concurrence — entanglement-of-formation, monogamy-aware
    complement to negativity), `DiagonalEnsemblePanel` (energy-basis populations
    pₖ = |⟨Eₖ|ψ⟩|² + ⟨H⟩ / ΔE / d_eff — ETH), `StructureFactorPanel` (S(k) = FT of the connected ⟨ZⱼZₗ⟩ correlator;
    k=0 ferro / k=π Néel), `KrylovPanel` (Lanczos bₙ operator-growth bars +
    spread-complexity C(t) curve under a Pauli-sum H), `OperatorEntanglementPanel`
    (operator-Schmidt spectrum of the circuit unitary across the mid-cut —
    entangling power; CNOT→1, SWAP→2 ebits), `AsymmetryPanel` (depth-swept
    entanglement asymmetry ΔS_A — U(1)-symmetry breaking / quantum Mpemba).
  - Characterization / benchmarking (run-on-click, default-collapsed): `RbPanel`
    (single-qubit randomized benchmarking — 24-elem Clifford group via BFS over
    {H,S}, survival fit P(m)=A·p^m+½, error-per-Clifford r=(1−p)/2;
    `sim/randomizedBenchmarking.ts`. **Three modes**: Standard, **Interleaved**
    (`interleavedRb` — gate-specific error r_G=(1−p_int/p_ref)/2 + Magesan
    bound, dual ref/interleaved decay plot), **Unitarity** (`unitarityRb` —
    purity decay Tr(ρ²)→1/d via density mode, fit u for error coherence)),
    `QecPanel` (bit-flip repetition code d=3/5/7, syndrome→min-weight lookup
    decoder, Monte-Carlo logical-error sweep crossing the threshold p=½;
    `sim/qec.ts`), `QvPanel` (**Quantum Volume** — Haar SU(4) model circuits,
    heavy-output probability vs the 2/3 threshold w/ 2σ bound, QV=2^(largest
    passing width); `sim/quantumVolume.ts`), `MirrorPanel` (**mirror /
    volumetric** — random Clifford forward+inverse mirror circuits, success
    P(|0…0⟩) heatmap over a width×depth grid; `sim/mirrorBenchmark.ts`),
    `XebPanel` (**cross-entropy benchmarking** — random brickwork circuits,
    linear XEB fidelity Σ(p_n−1/D)(p_i−1/D)/Σ(p_i−1/D)² vs cycle depth,
    per-cycle λ; `sim/xeb.ts`), `CrosstalkPanel` (**simultaneous RB** — per-qubit
    isolated-vs-simultaneous EPC, paired runs [shared Clifford seqs + seeded
    `Math.random`] so crosstalk 0 ⇒ addressability exactly 1; spectator model
    folds `noise.crosstalk·deg` into depol; `sim/simultaneousRb.ts`),
    `T1T2Panel` (**T1 inversion-recovery + T2 Ramsey** — idle = identity-gate
    chain so per-gate damping accumulates; decay constants in gate-times;
    `sim/t1t2.ts`), `PauliBudgetPanel` (**Pauli error budget** — per-qubit X/Y/Z
    error stacked bars via the Pauli-twirl approx of depol+amp+phase damping,
    exact/instant; `sim/pauliBudget.ts`).
  - The right column groups all ~65 panels under 12 sticky **category headers**
    (Controls / State / Measurement / Phase space & magic / Expectation &
    metrology / Entanglement & correlations / Dynamics / Operator & spectrum /
    Circuit structure / Noise & error / Characterization & benchmarking /
    Verification & export). The per-panel "unverified" red dot was removed.
  - `CouplingMapView.tsx`: shared SVG render of an adjacency list as
    a node-link graph (circular layout ≤ 24 qubits, grid above).
- `server/` — FastAPI shell: `/api/health` + static-file mount.
- `examples/` — 93 hand-written OpenQASM 3 example circuits across
  10 categories, imported into the client via Vite `?raw`. Each file
  has a header comment block; `extractDescription` in
  `client/src/examples.ts` pulls it out as a tooltip for the file
  picker.
- `docs/` — markdown documentation: `panels.md` (per-panel
  reference), `tutorial.md` (workflow-based hands-on tour in six
  parts, covering the full feature breadth incl. the visualisers,
  cross-linked to panels.md),
  `architecture.md` (codebase map / data flow / fast paths),
  `qasm.md` (OpenQASM round-trip + the eight SDK emitters). All four
  are imported into the app via `client/src/editor/DocsModal.tsx` and
  surfaced as tabs through the toolbar **Help** menu. The markdown
  renderer is a small in-house component in
  `client/src/editor/Markdown.tsx` — shared by DocsModal AND the AI
  chat panel, which renders each assistant reply's prose parts through
  it (fenced code blocks are still handled by the chat's own
  QASM-aware code-block path; user messages stay literal). It renders
  **LaTeX via KaTeX** — block `$$…$$` / `\[…\]`, inline `$…$` / `\(…\)`
  — through the shared `panels/Tex.tsx` (which defines quantum braket
  macros `\ket`/`\bra`/`\braket`/`\expval`/`\tr`). The chat system
  prompt tells the model to write math in `$…$` / `$$…$$`. The chat
  header has a **prompt library** picker (`PromptPicker` in
  `ChatPanel.tsx`, data in `panels/promptLibrary.ts`): a searchable,
  categorized popover (Analyze / Create / Optimize / Transform / Explain
  & derive / Debug & verify / Export & hardware) whose entries insert a
  ready-made prompt into the input for editing (append, not auto-send;
  bracketed `[values]` are placeholders). 10 categories / ~65 prompts
  (Analyze / Create / Optimize / Transform / Explain & derive / Debug &
  verify / Export & hardware / Noise & error / Benchmark & characterize /
  Visualize & interpret). The circuit QASM is auto-attached to every
  message, so prompts can say "this circuit"; the benchmark/visualize
  prompts are written to *interpret* Quantiom-computed results. The chat
  has two modes (header toggle): **chat** (1:1) and **dialogue** — an
  AI↔AI discussion where two model instances (roles A/B, each its own
  persona + model via `RolesPicker`) take turns about the current
  circuit, every turn grounded in the same QASM+context. Presets
  (Proposer↔Critic / Professor↔Student / IBM↔Rigetti), a turn cap, Stop,
  and "jump in" (inject a human turn, then Continue). Pure core (turn
  assembly, speaker bookkeeping, persistence) in `panels/dialogue.ts`
  (tested); the React runner wraps `streamChat` per turn in ChatPanel.
  Dialogue QASM blocks get a click-to-open-tab button (no auto-open, to
  avoid tab spam across many turns). Cost guards: bounded turn loop, live
  turn counter, and a Jaccard-based convergence early-stop
  (`turnsAreConverging`). **export** downloads the transcript (+ circuit)
  as Markdown via `dialogueToMarkdown` (pure, tested).
  `client/src/editor/AboutModal.tsx` — the toolbar **About** button
  (next to Help) opens it; shows name, version, description, GitHub
  URL, the "Developed by Claude Code in collaboration with Andre
  Paquette" line, and the MIT copyright. The repo also has a root
  `LICENSE` (MIT, © 2026 Andre Paquette) + `THIRD_PARTY_LICENSES.md`.

## Conventions

- **npm 10 only for the client.** Docker (`node:20-alpine`) and CI
  (Actions node 20) both run **npm 10**, and `client/package.json` pins
  `"packageManager": "npm@10.9.8"` + `engines.npm ">=10 <11"`. The
  `package-lock.json` MUST be generated with npm 10 — npm 11 resolves the
  Vitest/vite/esbuild tree differently and produces a lock that npm 10's
  `npm ci` rejects ("Missing: esbuild@… from lock file"), breaking the
  Docker build. If your machine's default npm is 11, regenerate the lock
  with `npx npm@10 install` (never commit an npm-11-generated lock).
  Vitest is pinned to the 2.x line so its bundled vite matches the app's
  vite 5.4.
- TypeScript strict.
- Big-endian basis: qubit 0 is the MSB of basis index.
- The Float64Array state has `re` at even indices and `im` at odd;
  size is `2 · 2ⁿ`.
- Greek letter ↔ ASCII map in `expr.ts` matches the inspector's
  display function in
  [client/src/panels/ParameterPanel.tsx](client/src/panels/ParameterPanel.tsx).
- The OpenQASM 3 emitter/parser pair preserves the symbolic look of
  the parameter expressions; it does not evaluate them.
- **Circuit name** is an optional field on the IR (`Circuit.name`).
  Set by the FileMenu when a circuit is loaded (example label or file
  basename) and rendered in the centre of the app header. Manual edits
  preserve the name; Clear leaves it undefined ("Untitled").
- **Version** in the header is built from `package.json` semver plus
  `__GIT_COMMITS__` and the short `__GIT_SHA__` injected at build
  time via `vite.config.ts`. The Dockerfile installs git and copies
  `.git` in so this works inside the production image.
- **Probabilities panel** has two modes — `exact` (truth) and `shots`
  (sampled). The sampler is in
  [client/src/sim/sample.ts](client/src/sim/sample.ts); it normalises
  the exact probabilities, builds a cumulative distribution, and
  binary-searches per shot.
- **Measurement-counts panel** is the dynamic-circuit equivalent —
  runs N full simulations with Math.random as the measurement RNG,
  tabulates classical-register bitstrings.
- **Default-fast invariant**: every new feature must either run only
  on user click (Optimise, Landscape, Plateau, ZNE, Compare, Sample
  syndromes, Sample counts, Compute χ, Route, Transpile, Optimise
  circuit, Append U†, Compact, Record), be opt-in (Noise toggle,
  custom Kraus, crosstalk), or short-circuit when the circuit doesn't
  use the feature. The bare gate-application hot path on a
  Clifford-free, measurement-free, parameter-free circuit is byte-
  identical to the early-Tier-0 version.
- **Panel collapse propagation**: `PanelShell` publishes its
  collapsed state via `usePanelCollapsed()`; expensive `useMemo`
  bodies short-circuit when collapsed. `SimResult` exposes
  `amplitudes`, `probabilities`, `blochVectors` as lazy getters that
  compute on first access and memoise.
- **Storage keys**: `quantiom:tabs:v1` (with legacy
  `quantiom:circuit:v1` migration), `quantiom:custom-gates:v1`,
  `quantiom:noise:v2`, `quantiom:panel-collapsed:v1`,
  `quantiom:probabilities-mode`, `quantiom:probabilities-shots`,
  `quantiom:palette-collapsed` (whole gate-palette collapse),
  `quantiom:panels-collapsed` (whole right-panel-column collapse).

## Testing

- **Framework: Vitest** (`client/`). Tests live in `client/test/*.test.ts`
  and run in the Node environment (the suite is pure logic — no DOM).
  Run with `npm test` (CI mode), `npm run test:watch`, or
  `npm run test:coverage`. `npm run typecheck:test` type-checks the
  tests via `tsconfig.test.json`.
- **CI**: `.github/workflows/ci.yml` runs typecheck (src + tests) →
  `npm test` → `npm run build` on every push and PR.
- **What's covered** (899 tests): the simulator core is deeply covered —
  `complex`/`matrices` (every gate's unitarity + known identities),
  `simulate` (Bell/GHZ/rotations/measurement/big-endian + the full
  `initialize()` gate: basis labels, amplitude tuples, failure paths),
  `expr`, `apply`, `expectation`, `measure` (Z/X/Y bases + reset),
  `stabilizer` (tableau correlations vs statevector, the GF(2)
  single-qubit Bloch reduction, and the noisy Pauli-frame rules),
  `resources`, `equivalence`, `inverse` (U†·U = I, the `inverseGates`
  range/re-pack path, every angle family), the OpenQASM round-trip +
  the `parse.ts` statement/modifier-chain/error branches, all eight SDK
  emitters (a dedicated per-gate-family suite each), `transpile`/`router`/
  `trotter`, the noisy simulator (incl. `noisyPauliExpectation` /
  `noisyExpectationObservable` with post-selection + custom Kraus), the
  optimiser (Adam/SGD/QNG, zneFit linear/quadratic/exponential, landscape,
  plateau), PEC (all four inverse channels + uninverted reporting), `noise`
  (load/save/sanitise + the IBM importer), `tomography` (incl. the
  multi-qubit Kronecker path + noise mode), `sample`, KAK, the editor
  reducers + storage (`state.ts` history/coalescing/`loadFromStorage`,
  `tabs.ts` `multiReducer` + `buildInitial` migration), custom-gate expand
  + persistence, every visualiser substrate (the `test-vizbatch*` files), and
  the newer analysis helpers — `participation`, `concurrence` (incl. the
  degeneracy-safe √ρ), `qfi`, `qgt`, `symmetrySectors`, `coherence`,
  `spectralFormFactor`, `levelStatistics`, `diagonalEnsemble`, `branchTree`,
  `noiseImpact`, `decoherence`, `structureFactor`, `krylov`,
  `operatorEntanglement` (product 0 / CNOT 1 / SWAP 2 ebits), `entanglementAsymmetry`,
  `randomizedBenchmarking` (noiseless→survival≈1, decay→positive EPC), `qec`
  (repetition exact 3p²−2p³, MC matches exact, threshold≈½), and the
  benchmarking suite — `interleavedRb`/`unitarityRb` (noiseless→r≈0/u≈1, noise→
  decay), `quantumVolume` (haarSU4 unitarity, clean HOP beats noisy), `mirror
  Benchmark` (ideal mirror returns to |0…0⟩, noise→depth decay), `xeb` (clean
  F≈1, noise→λ<1), `simultaneousRb` (paired runs ⇒ addressability=1 at
  crosstalk 0, >1 with crosstalk+coupling), `t1t2` (T1≈−1/ln(1−γ), stronger
  damping→shorter T1), `pauliBudget` (depol→X=Y=Z=p₁/3, phase→pure Z) — each
  against analytic ground truth. The AI-dialogue pure core is covered too
  (`dialogue.ts`: `buildTurnMessages` alternation, `mergeConsecutive`,
  `nextSpeakerOf`, `turnsAreConverging`, `dialogueToMarkdown`).
  `npm run test:coverage` reports ~96% statements (core modules are
  95–100%; the remaining tail is the React `useReducer`/`useEffect` hook
  bodies and DOM-only `exportSvg`, which the Node-only suite can't exercise
  without jsdom).
- **Shared helpers**: `test/helpers.ts` (terse `circ()`/`gate()` builders +
  complex-matrix utilities); `test/check.ts` (adapter that lets the
  original `check(name, cond)` verification scripts register as Vitest
  cases — used by the migrated `test-*.test.ts` files).
- **Real bugs the suite has caught (all fixed)** — the suite has paid for
  itself several times over; when adding behaviour, add a test:
  - `equivalenceCheck` declared circuits with disjoint basis images
    (e.g. X vs Z) falsely equivalent — the global-phase lock never engaged.
  - `invertGate` mislabelled iSWAP (order 4) and DCX (order 3) as
    self-inverse.
  - **`optimisePasses` merged `sx·sx → x` *across* an intervening `rz`**
    (it popped the kept merged gate off the per-qubit stack, exposing the
    earlier gate) — broke the Optimise/Compile pipeline on every
    IBM-transpiled circuit. Fixed with a stack "blocker" sentinel.
  - **`optimiseCircuit` mutated its input** circuit's gate `column` fields
    (shared objects in the ASAP reflow) — could corrupt the user's open
    tab. Fixed by cloning gates up front.
  - **`pecExpectation` used `parseFloat` for gate params and ignored
    `paramValues`** — any symbolic param (`pi/3`) or free variable became
    NaN, poisoning the whole PEC estimate. Fixed to use `evalExpr`.

## Things not to propose

- **Sympy / Pyodide / server-side symbolic algebra.** The original
  sympy server-side path was tried, fought for half the project, and
  ripped out. See `feedback_client_side_simulator` memory.
- **Sonorizer.** Built, shipped, explicitly removed as "useless,
  uninteresting." Don't bring it back.
- ~~**Q-sphere.**~~ Was once rejected as "too large"; **reopened and
  SHIPPED 2026-06-03** (`QSpherePanel`, default-collapsed, n ≤ 6). Kept
  compact. Don't re-reject it.
- **In-tool tutorials, guided lessons.** Editor-first; the example
  library is the education.
- **Density-matrix mode beyond what trajectories give.** 4ⁿ memory
  caps n at ~10 for no extra scientific value over trajectories.
- **WebGPU for general statevector compute.** Engineering effort vs
  the n ≤ 20 ceiling doesn't pencil; researchers needing GPU go to
  qsim/cuQuantum. The Clifford fast path covers the "big n" niche.
  However, **WebGPU for trajectory parallelism in noise mode** is
  on-the-table — the foundation lives in `sim/webgpuTraj.ts` and the
  async wiring into Optimise/Landscape/Plateau/ZNE loops is a
  staged follow-up. M-series Macs with unified memory are the
  primary target; FP32 with optional double-float emulation is the
  precision path.
- **Real hardware backend integration.** Multi-week vendor work (auth,
  queue, billing). The six SDK exports cover the "I want to run on a
  QPU" workflow.
- **Pulse-level / OpenPulse.** Different field; out of scope.
- **Continuous-variable, qudits, topological, networks, annealing**
  as *simulation paradigms*. Different physics; out of scope. (Note: the
  **spin Husimi-Q** `HusimiPanel` ships as a qubit phase-space view — a
  CV-*analogue* visualiser, not a CV simulator. That's fine.)
- **ZX rewriting / T-count reduction (PyZX-grade).** The ZX *diagram*
  (`ZXPanel`) ships; automated spider-fusion / phase-gadget rewriting to
  minimise T-count is a separate research effort (same class as
  Solovay-Kitaev), still off the table.
- **MPS / tensor-network simulation.** Real engineering project for a
  niche use case.
- **Solovay–Kitaev / Ross–Selinger** exact rotation approximation in
  Clifford+T transpilation. Its own research project; we currently
  pass arbitrary rotations through with a warning.

## Earlier architecture (gone)

For history: the simulator used to run server-side with sympy. That
was removed in favor of a pure-TS `Float64Array` simulator because
sympy's GIL blocked animation frames, a 6-qubit 35-gate symbolic
circuit produced ~22 MB of LaTeX and took 32 s to render, and the
numeric panel path never needed symbolic at all.

If symbolic display is ever needed, the right path is the OpenQASM 3
view (already round-trippable) or a separate offline tool.
