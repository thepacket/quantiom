# Panel reference

Quantiom is built around an editor in the centre and a wall of *peer
panels* on the sides. Every panel is collapsible, persists its open /
closed state across sessions, and short-circuits all expensive
computation when collapsed — the cost of having a panel hidden is zero.
Open the ones you care about, close the rest.

Panels listen to the same shared simulation result, so they update in
sync on every circuit edit. Trajectory-averaged panels (anything that
runs the noise model) recompute on a debounced timer; exact panels
recompute on every keystroke.

This page is a tour of every panel.

---

## Statevector

The dense amplitude table. One row per non-zero basis state showing
its index, the complex amplitude `re + im·i`, the magnitude squared
(= measurement probability), and the phase angle.

**When available.** Always, except in the Clifford fast path
(`isStabilizer = true`) — the full 2ⁿ-amplitude representation isn't
materialised there. Use the Bloch panel instead when you're past the
stabilizer threshold.

**Controls.**
- **Hide zeros** — omits rows below 10⁻¹⁰ magnitude. Keeps the table
  readable on circuits with hundreds of basis states but only a
  handful populated.
- **Top-K cap** — caps the table at 64 rows by default. A "Show all
  N" toggle expands it when you actually want every amplitude.
- **CSV / JSON export** — dumps the visible amplitudes to a file
  (`amp.csv` or `amp.json`). The format mirrors what the panel shows;
  use it for plotting elsewhere.

**Performance.** O(2ⁿ) memory, capped at 20 qubits hard-wise. On
22-bit-wide circuits (which the simulator doesn't allow) you'd hit
out-of-memory immediately; the cap exists to prevent that.

**Tip.** When debugging a circuit that "should be" in a known state,
toggle Hide zeros and compare the surviving rows against the textbook
expression — easier than reading a sparse 256-row dense table by eye.

---

## Probabilities

The same data as Statevector, but as a bar chart of measurement
probabilities (with all phases dropped). Visually scans much faster
than the Statevector table for high-qubit circuits.

**When available.** Always.

**Modes.**
- **Exact** — exact probabilities from the (truth) statevector.
- **Shots** — sampled. The shot count is configurable from the
  toolbar dropdown (10, 50, 100, 500, 1k, 5k, 10k, 50k, 100k). Auto-
  shots timer (in the top toolbar) can re-roll the shots at 1, 5, 10,
  20, 40, or 60 Hz to give a live feel of statistical convergence.

**Controls.**
- **Sort descending** — order bars by probability instead of basis
  index. Useful for picking off the top-N most likely outcomes.
- **Top-K cap** — caps the chart at 64 bars by default. Identical
  show-all toggle as Statevector.

**Noise mode.** When noise is enabled, the chart shows trajectory-
averaged probabilities. The WebGPU trajectory simulator (when the
circuit fits its supported subset — 1q gates + depolarising noise
only) runs this off the main thread; otherwise the CPU does it
trajectory-by-trajectory.

**Tip.** In sampled mode, the chart shows shot-statistics fluctuation
even on a deterministic circuit. That's deliberate — it lets you
intuit how many shots are "enough" for a given precision target.

---

## Bloch spheres

One sphere per qubit, showing the reduced single-qubit Bloch vector
`(⟨X⟩, ⟨Y⟩, ⟨Z⟩)`. The vector tip indicates the state's location on the
unit sphere; magnitude `|r| < 1` indicates entanglement / mixedness.

**When available.** Always.

**What you see.**
- Pure single-qubit states sit on the surface (`|r| = 1`).
- Entangled qubits have reduced states inside the sphere
  (`|r| < 1`), with `|r| = 0` indicating maximally mixed (e.g. each
  qubit of a Bell state).
- For Clifford circuits in the stabilizer fast path, the reduced
  state is exactly one of {±X, ±Y, ±Z, origin} — never an interior
  point off-axis. The tableau extraction is exact.

**Noise mode.** When the GPU trajectory path is active for the
Probabilities panel, the Bloch vectors are computed from the same
trajectories (one f32 triple per qubit per trajectory, averaged on
read-back). When the GPU path isn't applicable, Bloch falls back to
CPU trajectory averaging.

**Tip.** The Bloch panel is the most useful visualization for getting
a feel for noise: dial up depolarising in the Noise panel and watch
the vectors shrink toward the origin in proportion to the channel
strength.

---

## Phase disk

A per-basis-state miniature complex-plane disk showing each amplitude
as a dot at its (real, imag) coordinates. The unit circle is drawn for
reference. Twin to Statevector but with phases visually obvious.

**When available.** Statevector path only (not in Clifford fast path).

**What you see.**
- Equal-magnitude superpositions: dots clustered on a circle of
  matching radius.
- Phase patterns: e.g. after a QFT, the dots rotate around the unit
  circle at multiples of the fundamental Fourier angle.
- A bit-flip code in superposition: dots stay near the unit circle
  but redistribute as the encoder spreads amplitude.

**Tip.** Open this alongside the Statevector panel — Statevector for
exact numbers, Phase disk for an immediate visual of phase structure
that's tedious to read from numbers.

---

## Expectation ⟨P⟩

The Pauli-string expectation calculator. Pick a Pauli on each qubit
(I / X / Y / Z) and the panel reports ⟨ψ|P|ψ⟩. Or switch to
**Hamiltonian mode** and paste a Pauli-sum H = Σ_k h_k P_k to compute
⟨H⟩ — the heart of every VQE / QAOA workflow.

This is the densest panel in the app — it bundles the expectation
calculation with five separate tool buttons:

**Optimise.** Tunes free parameters (every `θ`, `φ` etc. you've
declared in the circuit) to minimise ⟨H⟩. Default optimiser is Adam
with parameter-shift gradients; SGD and QNG (Fubini-Study natural
gradient) are also selectable. Live readout per step.

**Landscape.** Sweep one or two picked free symbols across `[-π, π]`
on a grid and render ⟨P⟩ as a curve (1 symbol) or heatmap (2 symbols).
Useful for visualising where your ansatz has flat regions vs. sharp
gradients before you commit to optimising.

**Plateau.** Barren-plateau diagnostic — samples N random parameter
points and reports `Var(∂⟨P⟩/∂θ_k)` per symbol. Variance collapsing
toward 1/2ⁿ as the circuit gets deeper is the classic barren-plateau
signature.

**ZNE.** Zero-noise extrapolation. Runs ⟨P⟩ at 1×, 2×, 3× noise
scales, fits the trend to γ → 0, and reports the extrapolated noise-
free estimate. Linear and quadratic (Richardson) fits selectable from
the dropdown. Only enabled in noise mode.

**PEC.** Probabilistic Error Cancellation. Inverts per-gate noise via
quasiprobability sampling, including amplitude damping (non-Pauli),
phase damping, and 1q + 2q depolarising. Variance overhead shown so
you know when the noise is too high to make PEC tractable.

**Compute.** Just runs the bare expectation with the current Pauli
selection.

**GPU acceleration.** In noise mode, the WebGPU shader batches the
expectation across all sum terms and per-qubit Bloch outputs in a
single trajectory pass (when the circuit fits the WebGPU subset
— 1q gates + depolarising). The CPU path takes over otherwise.

**Stabilizer path.** When the circuit is Clifford-only above the
stabilizer threshold, ⟨P⟩ is computed exactly from the tableau
(O(n²) per query) and falls in {−1, 0, +1}. Works on circuits up to
1024 qubits.

**Tip.** Hamiltonian mode autosaves the Hamiltonian text per tab —
your H₂ ansatz won't lose its Hamiltonian when you switch away and
back.

---

## Density matrix

The reduced density matrix ρ_A for a chosen subset A of qubits, via
partial trace over the rest. Shown as a Hinton-style heatmap of the
matrix's real and imaginary parts.

**When available.** Statevector path only. Hidden in the Clifford fast
path.

**Controls.**
- **Subset selector** — checkboxes per qubit pick the kept subset.
- **Display mode** — magnitude / phase / re / im colour scales.

**What you see.**
- Pure state on the subset: ρ is a rank-1 projector — one bright
  diagonal cell, off-diagonals showing coherence.
- Maximally mixed: ρ = I / 2^|A| — all diagonal cells equal, off-
  diagonals zero.
- Useful for verifying a partial trace by hand: "did my Bell pair
  reduce to I/2 on one qubit?".

**Performance.** O(4^|A|) memory, so practical to |A| ≈ 8 even on
large circuits. The panel guards against larger subsets with a notice.

---

## Hamiltonian → Trotter

Paste a Pauli-sum Hamiltonian (e.g. `0.5 * X1 X2 + 0.3 * Z0`) and the
panel generates the Trotter-Suzuki circuit for `exp(-iHt)`, evolving
your state under that Hamiltonian.

**Controls.**
- **Order** — 1 (first-order), 2 (Strang symmetric), 4 (Suzuki nested,
  α = 1/(4 − 4^⅓)).
- **qDRIFT mode** — Campbell 2019 random compilation. Useful when N
  Pauli terms make standard Trotter expensive; qDRIFT samples M terms
  randomly with importance weighting.
- **Time t** — total simulation time. Slide it to evolve the state
  forward or backward.
- **# steps** — discretisation; more steps = smaller Trotter error.

**Presets.** Buttons for TFIM (transverse field Ising), XXZ chain,
Heisenberg, and the H₂ Bravyi-Kitaev Hamiltonian — paste-ready, ready
to evolve.

**Output.** Generates a new tab with the Trotterised circuit ready to
simulate. The output is parametrised, so you can sweep t in the
Parameters panel of the new tab to watch the dynamics.

**Tip.** Use Plateau diagnostic on the resulting circuit to see how
Trotter depth affects trainability — it's a quick way to feel the
trade-off between time horizon and expressibility.

---

## Noise model

The noise dial. Sliders for every channel the simulator supports:
- 1q depolarising
- 2q depolarising
- Amplitude damping (T1)
- Phase damping (T2)
- Crosstalk (per coupling map)
- Readout bit-flip
- Custom 1q Kraus
- Custom 2q Kraus

Plus **per-qubit rates** for non-uniform noise, a **per-gate**
override table for gate-specific error rates, and an **IBM backend
importer** that ingests a Qiskit calibration JSON (T1, T2, sx
error, cx error, readout, coupling map, per-gate-id error rates).

**Device presets.** Four canned profiles (IBM Heron, Google Sycamore,
IonQ Aria, Demo) drop the rate fields to representative published
values for those architectures. Useful starting points.

**Coupling map.** When set, displayed as an SVG node-link graph
(circular layout ≤ 24 qubits, grid above). Used by crosstalk and the
router pass.

**Trajectories.** Number of Monte Carlo trajectories for the noise
simulation. Higher = more accurate ⟨P⟩, lower = faster. 100 is the
default; 1k is what you'd want for publication-quality numbers.

**Custom Kraus editor.** Paste 2×2 (1q) or 4×4 (2q) complex matrices
as `[[re_i im_i, re_j im_j], …]` arrays. The panel verifies trace
preservation and flags anything that breaks the channel structure
before applying.

**Tip.** Toggling noise off doesn't just hide the panel — the bare
gate-application hot path becomes byte-identical to the noiseless
simulator. Default state is fast.

---

## Resources

Gate counts and depth metrics — the panel a fault-tolerant researcher
checks first.

**What you see.**
- Total gates by id (cx: 17, h: 8, t: 4, …).
- T-count (the FT-cost-relevant primitive).
- **T-depth** — distinct columns containing T or T†. A tighter bound
  on FT cost than raw T-count.
- CX count (cost on most NISQ devices).
- Parallel depth (the actual time-on-device).
- Free-symbol count (variational parameter dimensionality).
- Distinct qubits touched.
- KAK cost estimate for any `u_arb_2` arbitrary 2-qubit unitary
  blocks (number of CXs needed for an optimal 3-CX decomposition).
- Connectivity violations against the current coupling map (how many
  2q gates would need SWAP routing on the configured hardware).

**Tip.** Before deciding whether to run the Optimise circuit pass,
check the gate breakdown here. Aggressive peephole reductions are
most valuable when T-count or CX count is the bottleneck.

---

## Equivalence

Compare two circuits (current tab vs. a file or another tab) for
unitary equivalence up to global phase.

**Controls.**
- **Source A** — current tab, fixed.
- **Source B** — another tab (dropdown), or a `.qasm` file (file
  picker).
- **Check** — runs the comparison.

**Output.**
- **Equivalent / not equivalent** verdict.
- **Process fidelity** F = |Tr(U_A† U_B)/2ⁿ|² as a number.
- **Trace-distance bound** √(1 − F).

**Cost.** Full unitary comparison for n ≤ 8, sampled-column comparison
above (compares a random subset of columns of U_A and U_B for the
inner product calculation; quadratically cheaper but probabilistic).

**Tip.** Equivalence is most useful as a sanity check after applying
the Optimise pass — verify that the optimized circuit still computes
the same unitary as the original.

---

## Syndrome sampling

The Clifford fast path's measurement panel. Samples bitstring outcomes
of measure-Z gates over N shots and shows the resulting histogram.

**When available.** Clifford-only circuits with explicit measurement
operations. The path is also chosen automatically when n > 16.

**Controls.**
- **Shots** — same 10 … 100k preset list as Probabilities.
- **Noise** — if noise is enabled, the syndrome sampler propagates a
  Pauli frame symplectically through Cliffords with per-gate
  depolarising error injection (`runCliffordNoisy`).

**Tip.** Use this for QEC error model testing — set a noise level,
run many shots, count the syndrome patterns, and verify that the
classical decoder you're prototyping accepts the right ones.

---

## Measurement counts

The dynamic-circuit equivalent of Syndrome sampling. Samples the
classical-register bitstring distribution by running N full
simulations with `Math.random` as the measurement RNG.

**When available.** Any circuit with classical registers and
measurements.

**Output.** Histogram with bitstrings on the x-axis and count /
probability on the y-axis.

**Tip.** For circuits with mid-circuit measurement + classical
feedback (the dynamic kind that `if (c[k] == v) …` enables), this is
the only panel that gives you the right outcome statistics — the
Probabilities panel would show the trajectory average over both
measurement outcomes, which isn't what you want.

---

## Tomography

Process tomography. Reconstructs the Pauli-basis χ matrix from
column-by-column unitary action — the cousin of state tomography for
gates rather than states.

**When available.** Circuits with ≤ 4 qubits (the χ matrix is 4ⁿ
× 4ⁿ; the cap prevents the panel from melting your tab).

**Controls.**
- **Noise toggle** — without noise: exact unitary tomography via the
  per-column `simulate` action. With noise: trajectory-averaged
  "average unitary" approximation via `simulateNoisy`.

**Output.** A heatmap and Hinton view of χ. Diagonal elements are the
populations of each Pauli basis operator; off-diagonals are their
coherences.

**Tip.** Compare χ for the ideal vs. noisy versions of a single gate
to see how the noise model distorts the gate's action — diagonal mass
shifts off the ideal Pauli and onto neighbouring Paulis indicate
specific error channels.

---

## OpenQASM 3

Round-trippable view of your circuit as OpenQASM 3 source code. Edits
in this panel are live: type in the QASM, the editor canvas updates.
Edit in the canvas, the QASM updates.

**Features.**
- Negative-control chains (anti-controlled gates) emit `negctrl @` modifier syntax.
- Conditional gates emit `if (c[k] == v) ⟨stmt⟩;` blocks.
- Compatible with OpenQASM 2: `qreg`, `creg`, `include "qelib1.inc"`
  all parsed for round-tripping legacy circuits.
- Symbolic parameters preserved verbatim (no premature numerical
  evaluation).

**Tip.** This is the easiest export: just copy the text out.

---

## Parameters

Slider panel for every free symbol declared in the circuit.

**Features.**
- Auto-detected from parameter expressions (anything that isn't a
  Greek glyph or number becomes a slider).
- Range, step, and current value editable per symbol.
- Animation: the special `t` symbol gets a ▶ button that scrubs it
  through `[0, 2π)` at 60 Hz — useful for visualizing time evolution
  in Trotterised dynamics.

**Tip.** Hover the slider on a row showing live ⟨P⟩ in the
Expectation panel to make the relationship between parameter and
observable visceral. Or use the Landscape tool for a static view.

---

## Compare

Cross-tab metric comparison. Picks two tabs, displays their Resources
breakdown side-by-side with a Δ column showing the difference.

**Use case.** Two versions of the same algorithm — say,
pre-optimisation and post-optimisation — laid out for easy diffing.
Or comparing a hand-written gate sequence to its Trotterised cousin.

**Tip.** Combine with Equivalence: Compare for "is one cheaper?",
Equivalence for "is it still the same unitary?".

---

## Chat (AI)

OpenRouter-backed chat panel. Bring your own API key (configured in
the panel's settings). Streaming responses, model picker, conversation
history per tab.

**Context attach.** A picker lets you attach panel snapshots (current
statevector / probabilities / Bloch / resources / noise / classical
register) as conversation context, so the LLM can reason about the
actual state of your circuit rather than what you describe to it.

**ASK button.** Send the current selection / hovered gate as a quick
question without typing.

**QASM auto-open.** Any QASM 3 code block in the LLM's reply gets a
button to open it as a new tab. Useful for "rewrite this Bell pair
as a Z-basis cat state" workflows.

**Tip.** Use it as a tutor, not an oracle. The LLM is great at
explaining concepts and proposing sequence changes; verify any
non-trivial output by running it in the simulator before trusting.

---

## Selecting panels

The right-rail panel selector controls which panels are visible.
Layout state (open / closed per panel, ordering) persists per tab in
local storage (`quantiom:panel-collapsed:v1`).

Collapsed panels cost nothing per frame — the `PanelShell` publishes
its collapsed state via `usePanelCollapsed()`, and every expensive
`useMemo` body short-circuits at the top when collapsed. So feel free
to keep dozens of tabs open with many panels each; closed panels are
free.
