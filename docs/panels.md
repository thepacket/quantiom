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

## Custom plots

Build a plot on demand instead of hunting for the right dedicated panel.
Pick a **quantity** from a catalog of 33, grouped by domain:

- **Per qubit** — ⟨Z⟩/⟨X⟩/⟨Y⟩, single-qubit entanglement entropy S(ρ_q),
  purity Tr(ρ_q²), or l₁ coherence.
- **Per basis state** — probability, |amplitude|, or amplitude phase.
- **1-D profile** — the entanglement-entropy or 2-Rényi-entropy profile
  across every cut, or the Pauli-weight distribution.
- **Pairwise matrix** — mutual information, connected ⟨ZᵢZⱼ⟩ / ⟨XᵢXⱼ⟩ /
  ⟨YᵢYⱼ⟩ correlations, log-negativity, or concurrence.
- **Single scalar** — mid-cut entanglement entropy, stabilizer-Rényi magic
  M₂, Meyer–Wallach global entanglement Q, participation entropy, or global
  l₁ coherence.
- **Parameterized** (take an argument) — a **custom Pauli observable** ⟨P⟩
  (any Pauli string), the **energy** ⟨H⟩ of a Pauli-sum Hamiltonian you
  type, the **entanglement spectrum** at a cut you choose, the **OTOC**
  C(t) for operators W, V you pick, or the **energy spectrum** (eigenvalues)
  of a Pauli-sum Hamiltonian.
- **Grids & scatter** — the **discrete Wigner** function, the spin
  **Husimi-Q** phase space, the circuit **unitary** magnitude |U_ij|, and
  the **Pauli transfer matrix** (all heatmaps), plus an **amplitude
  scatter** that places each amplitude on the complex plane.

Then an optional **sweep** (none, vs circuit *depth*, or vs the *t* clock
over one period — sweeps apply to the per-qubit and scalar quantities), and
a **chart** (bars, line, heatmap, or scatter). The panel re-simulates as
needed and draws the result: matrix/grid quantities render as a heatmap,
swept per-qubit quantities as a multi-line plot (one line per qubit) or a
qubit × step heatmap, and a swept scalar as a single curve over depth/time.

The plot is described by a small validated *spec*, never executable code,
so the **AI assistant can create one from a plain-English request** — ask
it to "plot ⟨X⟩ for each qubit vs circuit depth" and it replies with a
`plotspec` block carrying a one-click **+ add plot** button that drops the
chart into this panel (and reveals it). Saved plots persist across
sessions. Like every analysis panel it runs only while open.

**Plot programs (advanced).** For a plot the catalog can't express, the
**+ code** button (or the AI's `plotjs` block) adds a code plot: a short
snippet `(data) => scene` that computes a declarative scene
(lines / rects / circles / paths / text) from the amplitudes, the
measurement counts, or the per-qubit reduced density matrices (`data.rho1`).
The code is
**sandboxed** — it runs in a Web Worker with no DOM and with network /
storage access removed, a hard timeout guards against infinite loops, and
the returned scene is sanitised (whitelisted shapes, clamped numbers,
restricted colours, SVG-only path data) before it's drawn. It cannot reach
the page, the network, or your data beyond the read-only `data` it's given.
Click **edit** on the card to tweak the code and watch it re-run.

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
- **Hide 0's** — omits rows below 10⁻¹⁰ magnitude. Keeps the table
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
toggle Hide 0's and compare the surviving rows against the textbook
expression — easier than reading a sparse 256-row dense table by eye.

---

## Amplitude · phase

One **horizontal bar** per computational basis state, one row each: the
bar's **length** is the amplitude magnitude |⟨x|ψ⟩|, its **hue** is the
phase arg⟨x|ψ⟩ (mapped around the colour wheel, −π … +π shown in the
legend), and the basis label (or index, when there are many) sits in the
left gutter. This is the only view that exposes the *full-state* phase —
the Bloch and Phase-disk panels only show per-qubit phase, and the
Statevector table shows raw numbers.

**When available.** Statevector path only (not in Clifford or noise
mode). When 2ⁿ exceeds 64 bars, the largest-magnitude basis states are
shown (in index order) and a note reports the truncation.

**What you see.**
- **Equal superposition** (Hadamards): all bars the same length, all
  the same hue (phase 0).
- **Grover after the oracle**: the marked state's bar flips to the
  opposite hue (the π sign flip) while magnitudes stay equal — the
  interference the diffuser then amplifies.
- **QFT / phase kickback**: a staircase of hues across the basis states
  as the Fourier phases wind, with magnitudes flat.

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

## Symmetry sectors

How the measurement weight splits across the **excitation-number**
(Hamming-weight) sectors and the **Z₂ parity** of the computational basis: a
bar chart of the total probability in each sector k = 0…n, with badges
flagging whether the circuit **conserves particle number** (all weight in one
k — a number-conserving ansatz) or **parity**, plus the global parity
⟨ΠZ⟩ = P_even − P_odd.

**When available.** Reads the basis probabilities, so it works in both pure
and noise modes; capped at 16 qubits.

**What you see.** A number-conserving circuit (Givens rotations, hopping
terms, iSWAP) keeps every bar in a single excitation sector. GHZ_N occupies
only k = 0 and k = N — parity-conserved for even N, parity-mixed for odd.
Hadamards spread the weight binomially across all sectors.

---

## Entanglement asymmetry

How much a subsystem **breaks a symmetry**, swept over circuit depth:
ΔS_A = S(ρ_{A,Q}) − S(ρ_A), where ρ_{A,Q} is the reduced state of the first
⌈n/2⌉ qubits projected onto its U(1) charge (excitation-number) sectors.
ΔS_A ≥ 0 is zero exactly when ρ_A is block-diagonal in the charge
(symmetric) and grows as cross-charge coherences develop. Plotted as a curve
of ΔS_A vs column.

**When available.** Statevector path; n ≤ 12, subsystem capped at 5 qubits,
≤ 96 columns.

**What you see.** A symmetric (number-conserving) state stays at ΔS = 0. A
circuit that builds cross-sector superposition raises it; a **rise then fall**
is symmetry *restoration* — the recently discovered quantum Mpemba effect,
where a more-asymmetric initial state can re-symmetrise faster.

---

## Participation / IPR

Localization in the computational basis: the **inverse participation ratio**
IPR = Σ pᵢ², the **participation ratio** PR = 1/IPR (the effective number of
occupied basis states), and the **Shannon / Rényi-2 participation entropies**.
A log-scale gauge runs from *localized* (PR = 1, one basis state) to *uniform*
(PR = 2ⁿ), and a per-column sweep shows PR — the delocalization front — grow
with circuit depth.

**When available.** Reads the basis probabilities (works in noise mode);
capped at 16 qubits.

**What you see.** The Anderson / many-body-localization diagnostic: a
localized state keeps PR ~ O(1) independent of size, a thermal one spreads to
PR ∝ 2ⁿ. A Bell/GHZ state reads PR = 2; |+⟩^⊗ⁿ reads the maximum 2ⁿ. The
sweep climbs 2 → 4 → 8 … as each superposing/entangling gate spreads weight.

---

## Coherence

Quantum coherence in the computational basis — the off-diagonal
"superposition" resource that powers interference and is exactly what
decoherence destroys. Two measures: the **l₁-norm of coherence**
C_l1 = Σ_{i≠j}|ρ_ij| (max 2ⁿ−1) and the **relative entropy of coherence**
C_rel = S(ρ_diag) − S(ρ) (max n bits).

**When available.** Pure mode reads the statevector (n ≤ 16); **noise mode
reads the trajectory-averaged ρ** (n ≤ 6) so you watch coherence decay as the
off-diagonals shrink.

**What you see.** A basis state has zero coherence; |+⟩^⊗ⁿ saturates both
maxima; a GHZ state reads C_l1 = 1, C_rel = 1 bit. Turn on phase damping and
both shrink — the gap below the pure-state value is the coherence the noise
has destroyed (the panel reports S(ρ) alongside).

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

## Bloch trajectory

The full 3-D path each qubit's Bloch vector traces as the `t` clock
sweeps one period, drawn on the same axonometric sphere as the Bloch
panel (green dot = start, warm dot = end). Where the t-sweep panel shows
only ⟨Z⟩(t), this shows the whole curve.

**When available.** Only with a free `t` symbol; statevector path,
capped at 12 qubits.

**What you see.**
- A single-axis drive (`rx(t)`): a flat great circle.
- An off-axis or two-frequency drive: a tilted loop or a Lissajous-like
  figure that doesn't close on itself.
- A qubit getting entangled as `t` advances: the vector spirals *inward*
  (its Bloch length shrinks as it mixes with the rest).

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

## Q-sphere

The whole multi-qubit state on one sphere. Each computational basis
state |x⟩ is a point: **latitude = Hamming weight** (|0…0⟩ at the north
pole, |1…1⟩ at the south pole, weight-k states on the k-th ring),
**marker size = |amplitude|**, **hue = phase**. It packs magnitudes and
relative phases into a single picture.

**When available.** Statevector path only; capped at 8 qubits (256 points).

**Interaction.** The view is an orbitable 3-D globe — **drag to rotate**,
**scroll to zoom**, **double-click to reset**. A wireframe of latitude rings
(one per Hamming-weight level) and meridians orients the sphere, and the
**equatorial plane** (the z = 0 great circle) is drawn as a translucent disk.
Faint **Bloch-convention reference guides** label the cardinal directions —
|0⟩ at the north pole, |1⟩ at the south pole, |+⟩ and |−⟩ on the ±x equator —
purely to orient the view (they are orientation aids, not Q-sphere basis
points). **Hover any dot** for an IBM-Composer-style tooltip showing the **State |x⟩**,
its **Probability** (= |amplitude|²), and the **Phase angle** (as a multiple of
π) with a swatch in the dot's phase hue.

**What you see.**
- **GHZ**: two big antipodal dots (poles), a half-turn apart in phase if
  you add a relative phase.
- **W state**: a ring of equal dots at weight 1.
- **QFT output**: a phase gradient (rainbow) winding around each ring.
- **Product state |+⟩ⁿ**: dots on every ring, sizes following the
  binomial weights.

---

## Wigner function

The **discrete Wigner function** — the qubit phase-space quasi-probability
W(u) = (1/2ⁿ)Tr(ρ·A_u) on the 2ⁿ×2ⁿ grid of phase-point operators. Blue
cells are positive, warm cells **negative**; W sums to 1, and **negativity
is the non-classicality signal**.

**When available.** Statevector path only; capped at 4 qubits (16×16).

**What you see.**
- **Stabilizer states** (Pauli eigenstates, Bell at single-qubit level):
  non-negative — "classical" in phase space.
- **Magic states** (T|+⟩, …): negative cells appear; the panel reports
  total negativity and the most-negative cell.

**Caveat (read this).** Unlike odd-dimensional qudits, the qubit
tensor-product construction is *not* Clifford-covariant, so for n ≥ 2 some
entangled **stabilizer** states also show negativity here. Treat W as a
phase-space *picture* of non-classicality and use the **Magic (M₂)** panel
for the rigorous, basis-independent stabilizer measure.

---

## Husimi Q (spin)

The spin (atomic) coherent-state Husimi Q-function Q(θ,φ) = |⟨θ,φ|ψ⟩|² as
a (θ, φ) heatmap, where |θ,φ⟩ = (cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩)^⊗n is
the coherent state pointing in direction (θ,φ). This is the
qubit/spin analogue of the optical Husimi-Q — and the **everywhere
non-negative** phase-space picture, the complement to the Wigner panel
(which can go negative).

**When available.** Statevector path only; capped at 7 qubits. Most
physical for permutation-symmetric states (Dicke / GHZ / spin-squeezed);
for a general state it's still the valid projection onto coherent
directions.

**What you see.**
- **Product / coherent state**: a single bright lobe at its Bloch
  direction (θ = 0 for |0…0⟩).
- **GHZ "cat"**: two antipodal lobes (north and south poles).
- **Spin-squeezed state**: an equatorial band that pinches in one
  direction — squeezing made visible.

---

## Magic (M₂)

The **stabilizer 2-Rényi entropy** M₂ (Leone–Oliviero–Hamma 2022): a
rigorous measure of *non-stabilizerness*. M₂ = −log₂(Σ_P Ξ_P²) − n with
Ξ_P = ⟨P⟩²/2ⁿ. **M₂ = 0 exactly when the state is a stabilizer state** —
what the Clifford fast path can represent — and it climbs with every
T-like gate. Additive over tensor products, invariant under Cliffords.

**When available.** Statevector path only (M₂ is a pure-state quantity);
reads all 4ⁿ Pauli expectations, so capped at 6 qubits.

**What you see.**
- The **M₂ value** (and M₂/n), with a tag flipping between "stabilizer
  state" and "has magic".
- The **Pauli-weight distribution** Σ_{|P|=w} Ξ_P as a bar chart: where the
  state's Pauli mass sits, low weight (local) → high weight (scrambled).
- A Clifford-only circuit reads exactly 0; appending a single `t` gate
  lifts it (e.g. T|+⟩ → M₂ ≈ 0.415 bit).

**Pairs with** the Wigner panel (visual) and the stabilizer simulator
(the M₂ = 0 boundary is exactly its domain).

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

## Quantum Fisher info

The **quantum Fisher information** F_Q[ψ, J_α] = 4 Var(J_α) for the
collective-spin generator J_α = ½ Σᵢ σ_α (axis X/Y/Z selectable) — the
phase-estimation sensitivity and a multipartite-entanglement witness. F_Q is
placed on a track from 0 to the Heisenberg limit N², with the standard
quantum limit (SQL = N) marked.

**When available.** Pure statevector path; capped at 14 qubits.

**What you see.** Separable states sit at or below the SQL (F_Q ≤ N);
**F_Q/N > 1 witnesses metrologically useful entanglement.** A GHZ cat
saturates the Heisenberg limit F_Q = N² along its sensitive axis (and reads
the SQL along the others), while a product |+…+⟩ sits exactly at N. The
metrological gain F_Q/N is the headline number.

---

## Quantum geometric tensor

The geometry of the circuit's parameter space: the **Fubini–Study metric**
g_ij = Re Q_ij — the metric the quantum natural gradient descends — shown as
a heatmap over the free symbols, with its determinant √det g (the local
state-space volume) and eigenvalues (principal sensitivities). The imaginary
part is the **Berry curvature** F_ij = −2 Im Q_ij, flagged when non-zero.

**When available.** Needs at least one free symbol; statevector path,
n ≤ 12, ≤ 8 symbols. Mid-circuit measurement disables it (the QGT needs a
pure parameterised state ψ(θ)).

**What you see.** A single RY(θ) gives g = ¼; independent rotations give a
diagonal metric; entangling gates introduce off-diagonal cross-terms.
Directions where g is large are the parameter combinations the state is most
sensitive to — and 4·g equals the multi-parameter quantum Fisher information.

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

## Unitary heatmap

The circuit's full 2ⁿ × 2ⁿ operator in the computational basis, drawn
as a grid where each cell's **brightness** is |U[i,j]| and its **hue**
is arg(U[i,j]). Built column by column (input |j⟩ → output column j),
the same construction the Equivalence checker uses. This is the
operator itself, in the standard basis — distinct from the Tomography
panel's χ-matrix (the process matrix in the Pauli basis).

**When available.** Capped at 6 qubits (64×64). A circuit with
measurement / reset is no longer a unitary; the panel still renders the
per-basis output columns but flags that they aren't a true unitary.

**What you see.**
- **Permutations** (X, SWAP, Toffoli): exactly one lit cell per row and
  column, all the same hue — the operator just relabels basis states.
- **Controlled gates**: a block-diagonal structure, the identity block
  on the control-0 subspace and the gate on the control-1 subspace.
- **QFT**: uniform brightness everywhere (every |U[i,j]| = 2^(−n/2))
  with a phase staircase in the hue — the cleanest possible picture of
  what the Fourier transform *is*.

---

## Pauli transfer matrix

The circuit unitary's action in the (normalised) Pauli basis:
R_{ij} = (1/2ⁿ)Tr(P_i·U P_j U†), a 4ⁿ×4ⁿ real heatmap with rows/columns
labelled by Pauli strings (II, IX, …) and entries in [−1, 1] (blue +1,
warm −1). This is the "what does the gate do to each Pauli" view — the
Pauli-basis sibling of the unitary heatmap and the χ-matrix.

**When available.** Capped at 3 qubits (64×64). Measurement / reset are
flagged: the matrix shown is the unitary part only.

**What you see.**
- **Clifford gates** (H, S, CNOT, …): a *signed permutation* — exactly
  one ±1 per row and column, since a Clifford maps every Pauli to ±another
  Pauli. H shows X↔Z and Y→−Y; S shows X→Y, Y→−X.
- **Non-Clifford gates** (T, arbitrary rotations): off-axis weight — e.g.
  a T rotates within the X–Y block, smearing those entries.
- The (I,I) corner is always 1 (any unitary preserves the identity).

---

## ZX diagram

The circuit as a ZX-calculus diagram: **green Z-spiders**, **red
X-spiders**, **yellow Hadamard boxes**, plain wires, and dashed
**Hadamard edges** (CZ), laid out on the circuit's qubit×column grid with
phase labels beside the spiders. Z/S/T/Rz/P map to green spiders, X/√X/Rx
to red, H to a box, CX to green–(plain edge)–red, CZ to green–(H-edge)–green;
anything without a pure-spider form (e.g. Ry, U) renders as a labelled
generic box so the diagram stays complete.

**When available.** Any circuit (purely structural — no simulation),
capped at 12 qubits × 60 columns. A "fusable spider pairs" hint counts
adjacent same-colour spiders.

**What it's for.**
- Seeing the **Clifford skeleton** and where the non-Clifford phases
  (π/4 green spiders = T gates) actually sit — the T-count at a glance.
- Recognising graph-state structure (a wall of green spiders joined by
  H-edges).

**Scope.** This renders the diagram faithfully; it does **not** perform ZX
rewriting / T-count reduction (PyZX-style) — that's a separate effort. The
fusable-pairs hint is a count, not an applied simplification.

---

## Operator entanglement

The **entangling power** of the circuit unitary U itself, independent of any
input state. Viewing U as a state in the doubled Hilbert space and taking its
Schmidt decomposition across the middle qubit cut gives the operator-Schmidt
spectrum (a bar chart) and the **operator entanglement entropy**
E_op = −Σ λ_i log₂ λ_i.

**When available.** Builds the dense 2ⁿ × 2ⁿ unitary, so capped at 6 qubits.

**What you see.** A product circuit U = U_A ⊗ U_B is a single bar (E_op = 0,
non-entangling). A **CNOT across the cut** gives E_op = 1 ebit; a **SWAP** is
maximal (2 ebits for one qubit each side). A flat spectrum means a maximally
entangling operation. Unlike the state-entanglement panels, this characterises
the *gate sequence* — two circuits preparing the same state can have very
different operator entanglement.

---

## OTOC (scrambling)

The out-of-time-order correlator C(t) = 1 − Re⟨W(t)·V·W(t)·V⟩ over the
`t` clock, with W = Z on a "butterfly" qubit and V = Z on a "measure"
qubit (both selectable), evaluated on |0…0⟩. C(t) ≈ 0 while W(t) and V
still commute and **rises toward 1 as the operator front reaches the
measure qubit** — the standard diagnostic of information scrambling. The
rise time over the qubit separation is the butterfly velocity.

**When available.** Only with a free `t` symbol; statevector path. Builds
the dense unitary at each sample, so capped at 6 qubits.

**What you see.**
- A circuit with no path between W and V: C(t) stays flat at 0.
- A coupled chain (`rzz(t)` ladder, kicked-Ising): C(t) stays ~0 until
  the front arrives, then climbs — pick W and V far apart to see the
  delay, adjacent to see it rise immediately.

---

## Mutual information

The entanglement *topology* of the state, as an n×n heatmap. Each
off-diagonal cell (i, j) is the pairwise quantum mutual information

    I(i:j) = S(ρ_i) + S(ρ_j) − S(ρ_ij)      (0 … 2 bits)

where S is the von Neumann entropy. The diagonal shows each qubit's own
entropy S(ρ_i) (0 … 1 bit) — how entangled that qubit is with the rest
of the register.

**When available.** Statevector path only (it needs reduced density
matrices). Hidden in the Clifford fast path and noise mode, and capped
at 12 qubits.

**What you see.**
- **Bell pair**: a single bright off-diagonal cell at I = 2 — maximal
  pairwise correlation.
- **GHZ**: a uniform all-to-all grid at I = 1 — every pair equally
  correlated.
- **Cluster / graph state**: a structured, *non-uniform* pattern. Note
  that two adjacent qubits can read I = 0 even when entangled: a cluster
  state hides its correlation in multi-qubit stabilizers, which the
  pairwise measure can't see — a useful reminder that mutual information
  is a two-point quantity.
- **Trotter / Floquet dynamics**: an entanglement front that spreads
  outward from the initially-correlated qubits as you step the circuit.
- **Product state**: blank.

**Performance.** Builds every pairwise reduced density matrix — C(n,2)
partial traces, each O(2ⁿ). Capped at 12 qubits and computed only while
the panel is open (default-collapsed), so it costs nothing until asked.

---

## Entanglement negativity

The pairwise **logarithmic negativity** E_N(i,j) = log₂‖ρ_ij^{T_B}‖₁, read
off the eigenvalues of the partial transpose of each two-qubit reduced
state, as an n×n heatmap. Because the PPT criterion is *exact* for two
qubits, **E_N(i,j) > 0 if and only if that pair is genuinely entangled.**

**When available.** Statevector path only; capped at 12 qubits.

**Reading it vs. mutual information.** This is the quantum-only complement
to the MI map. Mutual information counts classical + quantum correlation
together, so it can't separate shared randomness (I > 0, E_N = 0) from
entanglement. The sharpest illustration is **GHZ**: every pair has
non-zero mutual information but **zero negativity** — GHZ entanglement is
genuinely global, not stored in any pair. A **Bell pair** reads E_N = 1; a
product (or merely classically-correlated) pair reads 0. Open this beside
the MI map to see the distinction directly.

---

## Concurrence

The pairwise **Wootters concurrence** C(ρ_ij) ∈ [0, 1] of every two-qubit
reduced state, as an n×n heatmap — a faithful **entanglement-of-formation**
monotone (0 = separable, 1 = a Bell pair).

**When available.** Statevector path; capped at 10 qubits.

**Reading it vs. negativity.** Concurrence is monogamy-aware (Σⱼ C² ≤ 1 per
qubit), so the two maps are complementary. A **W state** reads C = 2/3 on
every pair (monogamy-saturating), while a **GHZ** state reads 0 on every pair
(its entanglement is global). A Bell pair reads 1. Open it beside the
negativity map for the full pairwise-entanglement picture.

---

## Space–time ⟨Z⟩

The many-body "space–time diagram": rows are qubits (q0 on top),
columns are circuit time steps, and each cell's colour is ⟨Z_q⟩ after
that column — blue for +1 (|0⟩ / spin up), warm for −1 (|1⟩ / spin
down), faint near 0. The whole dynamics is one static picture.

**When available.** Any circuit with at least one gate. Capped at
14 qubits × 80 columns.

**What you see.**
- **Kicked-Ising / Floquet**: horizontal stripes that flip sign every
  drive period — the period-doubling signature of a discrete time
  crystal (set the kick g ≈ π).
- **Trotterised chain**: excitations spreading outward along a light
  cone from where they started.
- **A bare X / flip**: that qubit's row turning warm at the column
  where the flip lands.
- **Static / diagonal circuit**: flat rows.

**How it's built.** Re-simulates the circuit truncated after each
column and reads each qubit's Bloch ⟨Z⟩. One simulation per column, so
it's an opt-in (default-collapsed) view rather than a per-frame one.
Circuits with mid-circuit measurement show the seeded single-trajectory
collapse per prefix.

---

## Space–time entropy

The companion to Space–time ⟨Z⟩: same qubits × columns grid, but the
cell intensity is the single-qubit entanglement entropy S(ρ_q) after
that column — dark for a pure (disentangled) qubit, bright for a
maximally-mixed one (S = 1 bit, maximally entangled with the rest). It
shows *where and when* entanglement grows, which the magnetisation map
can't.

**When available.** Statevector path; capped at 12 qubits × 80 columns.
One full simulation plus one 2×2 reduced density matrix per (qubit,
column), so it's opt-in (default-collapsed).

**What you see.**
- **Bell / GHZ prep**: the cells light up at the column where the
  entangling CX acts — instantly, not gradually.
- **Trotterised chain**: an entanglement front of rising entropy
  spreading along a light cone from the initial excitations.
- **Uncomputation tail**: entropy that rose then fades back to dark as
  a sub-circuit disentangles its ancillas.
- **Single-qubit-only circuit**: stays dark everywhere — no
  entanglement is ever created.

---

## Entanglement spectrum

Picks a bipartition A | (rest) and shows the **entanglement spectrum**
across it — the squared Schmidt coefficients (the eigenvalues of ρ_A),
sorted descending, as a bar chart — plus the bipartite von Neumann
entropy S(ρ_A) in bits and the Schmidt rank.

**When available.** Statevector path only; the smaller side of the cut
is capped at 6 qubits (ρ_A and its complement share the same non-zero
spectrum, so the smaller side is diagonalised).

**Controls.**
- **Cut selector** — checkboxes choose which qubits are in subset A.
  Defaults to the first half of the register.

**What you see.**
- **Product across the cut**: one bar at 1, rank 1, S = 0.
- **Maximally entangled cut**: a flat spectrum of 2^|A| equal bars,
  S = |A| bits.
- **Bell / GHZ across any cut**: two bars at 0.5, S = 1 bit.
- The **decay** of the spectrum is the bond dimension a matrix-product
  state would need to represent the cut faithfully — a fast read on how
  "hard" the state is classically.

---

## Entropy profile

Plots the bipartite entanglement entropy S(ρ_{[0..k]}) for **every
contiguous cut** k against the cut position — the area-law vs
volume-law diagnostic. Where the Entanglement-spectrum panel inspects
one cut in detail, this scans all of them at once. The dashed line is
the per-cut maximum min(|A|, |B|) bits.

**When available.** Statevector path only; the smaller side of each cut
is diagonalised, capped at 8 qubits there (cuts past the cap are left
as gaps).

**What you see.**
- **Product state**: flat at zero — no entanglement across any cut.
- **GHZ**: flat at exactly 1 bit for every cut (one shared bit
  regardless of where you cut).
- **Gapped ground state** (area law): rises a little near the edges
  then saturates — entropy set by the boundary, not the volume.
- **Thermalised / volume-law state**: the symmetric **Page arch**,
  peaking at the central cut where |A| = |B|.

---

## ZZ correlations

The two-point connected correlator C(i,j) = ⟨Z_iZ_j⟩ − ⟨Z_i⟩⟨Z_j⟩ as an
n×n diverging heatmap — blue for positive (aligned), warm for negative
(anti-aligned), faint near 0. The diagonal is the local Z variance
1 − ⟨Z_i⟩².

**When available.** Statevector path only; capped at 14 qubits.

**Reading it vs. mutual information.** The MI map shows *total* (incl.
quantum) correlation and is always ≥ 0; this shows the *signed*,
Z-basis correlation a physicist reads for ordering. A GHZ state has
C(i,j) = 1 everywhere (perfectly aligned); a singlet pair reads −1
(anti-aligned); a product state is blank off the diagonal. In a
Trotterised chain the correlations grow outward from the initial
excitations as you step the circuit.

**Note.** Off-diagonal cells are scaled to the largest |C| so the
correlation structure stays visible even when the diagonal variance
dominates.

---

## Structure factor S(k)

The **static structure factor** S(k) = (1/N) Σ_{j,l} cos(k(j−l)) C(j,l) — the
spatial Fourier transform of the connected ⟨Z_jZ_l⟩ correlator along the
qubit chain — as a curve over momentum k ∈ [0, π]. A **Bragg peak** is the
signature of spatial order.

**When available.** Statevector path; n ≤ 16.

**What you see.** A peak at **k = 0** is ferromagnetic / uniform order; a peak
at **k = π** is antiferromagnetic (Néel) order; an intermediate peak is a
density wave. Because it uses the *connected* (fluctuation) correlator, a
plain product state like |0101⟩ reads flat — genuine order shows up in
*superpositions* (e.g. an antiferromagnetic cat peaks sharply at k = π). The
panel reports the dominant k and its peak height.

---

## t-sweep ⟨Z⟩(t)

For circuits driven by the `t` clock, sweeps t over one period [0, 2π)
and plots each qubit's ⟨Z_q⟩(t) as a line — the static view of the
animation. Read oscillation frequencies, beats, and phase offsets
directly off the curves without playing the animation or recording it.

**When available.** Only when the circuit has a free `t` symbol (e.g.
`rz(t)`, `rx(t/2)`); otherwise the panel says so. Statevector path,
capped at 14 qubits. Other free symbols are held at their current
Parameters-panel values; only `t` is swept.

**What you see.**
- `ry(t)` on a qubit: a full cos(t) sweep from +1 to −1 and back.
- `rz(t)` on a |+⟩ qubit: a flat line at 0 — Rz only moves phase, not
  ⟨Z⟩ (the X-Y rotation shows up in the Phase-disk / Bloch panels
  instead).
- A kicked or multi-frequency drive: superposed oscillations and beats.

**How it's built.** One simulation per sample point (64), reading the
Bloch ⟨Z⟩ each time. Opt-in (default-collapsed).

---

## t-sweep spectrum

The Fourier transform of the t-sweep traces. Runs a real DFT of each
qubit's ⟨Z_q⟩(t) over one *periodic* period of the `t` clock and plots
the amplitude at each integer frequency bin (oscillations per period),
so the dominant Rabi / Larmor / Floquet frequencies show up as peaks
instead of being read off a wiggling line by eye. Bins are normalised
so a unit-amplitude cosine reads 1 at its bin; the DC bin
(time-average) is omitted from the plot.

**When available.** Only with a free `t` symbol; statevector path,
capped at 14 qubits. Samples 128 points (so up to bin 64 is resolved;
the first 16 bins are shown).

**What you see.**
- `rx(t)` / `ry(t)` on a qubit: a single peak at **bin 1** (one
  oscillation per period).
- A doubled-frequency drive (`rx(2*t)`): the peak moves to **bin 2**.
- **Beats / multi-frequency cascades**: several peaks whose spacing is
  the beat structure you'd otherwise have to infer from the time trace.

---

## Loschmidt echo

The **return probability** L(t) = |⟨ψ(0)|ψ(t)⟩|² over one period of the
`t` clock — how close the evolving state stays to where it started — with
the **rate function** λ(t) = −(1/n)ln L(t) overlaid (scaled). The rate
function's **cusps**, where L(t) touches zero, are the critical times of a
**dynamical quantum phase transition (DQPT)** — the dynamical analogue of
the free-energy kinks of an equilibrium phase transition.

**When available.** Only with a free `t` symbol; statevector path, capped
at 14 qubits. One simulation per sample point.

**What you see.**
- A single `rx(t)` qubit: L(t) = cos²(t/2), a smooth dip to 0 at t = π and
  back — and a clean rate-function spike (cusp) at that point.
- A quenched many-body chain (kicked-Ising / TFIM Trotter past a critical
  point): L(t) dips toward zero at the DQPT times, with the rate function
  cusping there — the signature researchers actually look for.
- A trivial / off-critical quench: L(t) stays well above zero, no cusps.

---

## Causal cone

A structural (no-simulation) view drawn on the **circuit canvas**, not a
chart. Pick a target qubit and a direction; the canvas dims every gate
outside that qubit's causal light cone, leaving only the sub-circuit
that matters.

**Controls.**
- **Direction** — *affects ←* (backward: gates that can influence the
  target's final state) or *→ affected by* (forward: gates the target's
  input can reach).
- **Qubit** — click to set the target; click again or *clear* to turn
  the overlay off.

**What it's for.**
- How deep a measurement's dependency reaches (backward cone of the
  measured qubit).
- Which gates an error on a given qubit could spread to (forward cone).
- Trimming a circuit mentally to the part relevant to one output.

Computed by one pass over the gate list (markers excluded); the cone
is cleared on tab switch.

---

## Tanner / check graph

The bipartite graph a decoder consumes, derived from the circuit's
measurement structure: round (data) qubits along the top, measurement
**checks** along the bottom, an edge wherever a qubit lies in that
measurement's causal support (the backward light cone of the measured
qubit). Each check's support = the effective stabilizer it reads out.

**When available.** Any circuit with measurements (purely structural —
reuses the causal-cone computation, no simulation). A circuit without
measurements says so.

**What you see.**
- **Repetition code**: weight-2 checks (each parity check touches two
  neighbouring data qubits).
- **Surface-code plaquette**: weight-4 checks.
- Hover a check to see its support set; the max weight is reported above
  the graph. Read it next to the Syndrome panel (which *samples* these
  checks) to connect structure to outcomes.

---

## Interaction graph

A node-link graph of the circuit's **logical** connectivity: qubits are
nodes, and an edge between i and j is drawn whenever a multi-qubit gate
acts on both, with thickness scaled by how many times. This is what the
circuit *wants* in terms of connectivity, independent of any hardware
coupling map — compare it against the coupling-map view in the Noise
panel to gauge how much routing (SWAP insertion) a device will need.

**When available.** Any circuit; pure topology (no simulation), capped
at 24 qubits for a readable circular layout. A circuit with no
multi-qubit gates reports that every qubit is isolated.

**What you see.**
- **Bell circuit**: a single edge.
- **1-D Trotter chain**: only nearest-neighbour edges — already matches
  a linear coupling map, so little routing is needed.
- **Fully-connected ansatz / QFT**: the complete graph — expensive to
  route onto heavy-hex or linear hardware.
- Edge **thickness** flags the hot pairs that dominate the two-qubit
  gate budget.

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

## Hamiltonian spectrum

The exact eigenvalue spectrum of a Pauli-sum Hamiltonian H = Σ h_k P_k —
the *target* a VQE run is reaching for. Enter H with the same grammar as
the Hamiltonian → Trotter panel (presets for TFIM, Heisenberg, H₂, a
single spin in a field); the panel diagonalises the dense 2ⁿ×2ⁿ matrix
and draws every energy level, the ground energy **E₀**, and the spectral
**gap** (which sets how hard the optimisation landscape is). If the live
circuit has the same qubit count, its **⟨H⟩** is overlaid as a dashed
line so you can see where the prepared state sits in the spectrum — drag
a VQE ansatz's parameters and watch ⟨H⟩ descend toward E₀.

**When available.** On demand; diagonalisation capped at 6 qubits.

**What you see.**
- A TFIM at its critical field: a small gap above a near-degenerate
  ground manifold.
- The Heisenberg dimer: a singlet ground state at −3 with a threefold
  triplet at +1.
- A VQE ansatz's ⟨H⟩ line sitting just above E₀ once optimised — the
  variational gap made visual.

---

## Spectral form factor

The **spectral form factor** SFF(t) = |Σₖ e^{−iEₖt}|² / D² of a Pauli-sum
Hamiltonian's spectrum, on log–log axes — the canonical quantum-chaos
diagnostic. Enter H as a Pauli sum (presets provided); the panel diagonalises
it and plots the dip → ramp → plateau, with the late-time plateau and
Heisenberg time t_H marked.

**When available.** n ≤ 6 (dense diagonalisation), on demand.

**What you see.** A chaotic (random-matrix) spectrum shows a clean linear
**ramp** between the dip and the plateau — the signature of level repulsion.
An integrable spectrum is bumpy and ramp-less. The plateau sits at
(Σ degeneracy²)/D².

---

## Level statistics

The **Oganesyan–Huse gap ratio** rₙ = min(δₙ, δₙ₋₁)/max(δₙ, δₙ₋₁) of a
Pauli-sum Hamiltonian's level spacings — the energy-domain chaos diagnostic
that needs **no spectral unfolding**. Histograms r with the Poisson
(⟨r⟩ ≈ 0.386, integrable) and GOE Wigner–Dyson (⟨r⟩ ≈ 0.531, chaotic)
surmise curves overlaid, plus a verdict.

**When available.** n ≤ 6, on demand.

**What you see.** A chaotic Hamiltonian piles r near the GOE value (level
repulsion); an integrable one follows Poisson. The chaotic preset uses a
longitudinal-field **gradient** to break the chain's reflection symmetry —
without it two symmetry sectors superpose and ⟨r⟩ collapses toward Poisson
even for a chaotic model (the panel reports the degenerate-spacing fraction
so you can spot when that bites).

---

## Diagonal ensemble (ETH)

Decomposes the current state in the energy eigenbasis of a Pauli-sum H and
plots the **populations pₖ = |⟨Eₖ|ψ⟩|²** vs energy — the weights of the
infinite-time-averaged diagonal ensemble ρ_DE that the eigenstate-
thermalization hypothesis says local observables relax to. Reports ⟨H⟩, the
energy spread ΔE, and the **effective dimension** d_eff = 1/Σ pₖ².

**When available.** Statevector path; H must match the circuit's qubit count;
n ≤ 6.

**What you see.** A state aligned with one eigenstate is a single spike
(d_eff = 1, ΔE = 0); a state that spreads over many eigenstates in a narrow
energy window (large d_eff) thermalizes. ⟨H⟩ is conserved under H-evolution,
so it pins where on the energy axis the dynamics live.

---

## Krylov complexity

Operator growth and **spread complexity** of state evolution under a Pauli-sum
H. Lanczos on the Krylov space {|ψ⟩, H|ψ⟩, H²|ψ⟩, …} produces the Lanczos
coefficients bₙ (top bar chart — the operator-growth profile) and the spread
complexity C(t) = Σₙ n |⟨Kₙ|ψ(t)⟩|² (bottom curve), which tracks how far the
evolving state has spread along the Krylov chain.

**When available.** Pauli-sum H input + presets; n ≤ 6 (dense diagonalisation),
on demand.

**What you see.** **Linearly growing bₙ** is the chaotic / maximal-growth
signature; saturating or oscillating bₙ is integrable. C(t) rises from 0,
peaks, and settles to a late-time plateau (the chain's centre of mass) — the
scrambling story in one curve. An eigenstate of H gives a one-dimensional
Krylov space and flat C(t) = 0.

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

## Decoherence

A depth-stepped movie of how noise drives the measurement distribution toward
uniform. For each circuit column it shows the trajectory-averaged probability
histogram, auto-looping forward as depth (and accumulated error) grows, with
a dashed line at the uniform 1/2ⁿ floor.

**When available.** Noise-mode only (default-collapsed); capped at 6 qubits ×
96 columns.

**What you see.** Early columns keep structure; as error accumulates the bars
flatten toward the uniform line — decoherence in motion. It's a workflow /
animation convenience: the Probabilities and Bloch panels already show the
noisy state, this one shows its *progression* with depth.

---

## Fidelity & purity

How far the noisy state ρ has drifted from the noiseless ideal ψ: the
**fidelity** F = ⟨ψ|ρ|ψ⟩, the **trace distance** to the ideal, the **purity**
Tr(ρ²), and the **von Neumann entropy** S(ρ) — four gauges.

**When available.** Noise-mode only; capped at 6 qubits (builds the dense
trajectory-averaged ρ).

**What you see.** With noise off the equivalents are F = 1, trace distance 0,
purity 1, S = 0. As noise rises, fidelity falls, trace distance and entropy
climb, and purity drops toward 1/2ⁿ (maximally mixed). The one-glance "what
is noise costing me?" readout — companion to Decoherence.

---

## Stabilizer generators

For a Clifford circuit, the **n signed Pauli generators** ⟨g₁, …, g_n⟩ of the
stabilizer group, read straight from the Aaronson–Gottesman tableau and
colour-coded by Pauli letter — the compact description of a stabilizer state
the statevector can't show past ~16 qubits.

**When available.** Clifford-only circuits (H/S/√X/CNOT/CZ/SWAP/Pauli +
measure/reset); works far past the statevector cap (up to 24 qubits shown).

**What you see.** |0…0⟩ is stabilized by +Zᵢ on each qubit; GHZ-4 reads
+XXXX / +ZZII / +IZZI / +IIZZ. A bit-flip turns the relevant sign negative.
The generators always commute pairwise — a valid stabilizer group.

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
- **Average gate fidelity** F̄ = (d·F + 1)/(d + 1) and the average gate
  error r = 1 − F̄ — the hardware-meaningful per-gate figures an RB
  experiment would report.
- **Diamond-norm distance** bounds ε◇ ∈ [1 − F, 2√(1 − F)] — a worst-case
  (not just average) error budget for the difference channel.
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

## Dynamic branch tree

The probabilistic outcome tree a circuit traces through its **mid-circuit
measurements and resets** — the dynamic-circuit counterpart of the
probability histogram. Each node is a measurement event, each edge an outcome
(0/1) carrying its conditional Born probability, each leaf a final classical
record with its cumulative probability.

**When available.** Any circuit with a measurement or reset; n ≤ 12, capped
at 8 branching events / 256 leaves with low-probability pruning.

**What you see.** A forking simulator clones and projects the state at each
measurement (rather than sampling one outcome), so conditional gates
downstream act per-branch. A Bell pair's two measurements collapse to only
the matching 00/11 leaves; the teleportation protocol shows two measurements
→ four equally-likely (25 %) branches — the signature that Alice's outcomes
reveal nothing about the teleported state.

---

## Randomized benchmarking

Single-qubit **randomized benchmarking**. Runs K random Clifford sequences of
increasing length under the noise model, appends the recovery Clifford that
inverts each sequence, and fits the survival probability P(m) = A·p^m + ½. The
headline is the **error per Clifford** r = (1 − p)/2 — the SPAM-robust gate
error (state-prep and measurement error fall into A and B, not p).

**When available.** Run on click; needs a non-zero 1-qubit noise rate to show
any decay (otherwise survival ≈ 1).

**What you see.** Survival-probability dots vs sequence length, with the
fitted exponential and the ½ asymptote. Stronger noise → faster decay →
larger EPC. The 24-element single-qubit Clifford group is enumerated by BFS
over {H, S}; each sequence runs through the trajectory noise simulator.

**Modes** (dropdown):

- **Standard** — the survival-decay fit above.
- **Interleaved** — runs a reference sweep and a second sweep with a chosen
  Clifford (X/Y/Z/H/S/S†/√X/√X†) interleaved after every random one. The decay
  ratio isolates that gate's error r_G = (1 − p_int/p_ref)/2, reported with the
  Magesan systematic bound; the dual plot shows both decays.
- **Unitarity** — runs random Clifford sequences (no recovery) and fits the
  purity decay Tr(ρ²) → 1/d to the *unitarity* u. u near 1 ⇒ coherent
  (calibration) error; u ≈ p² ⇒ purely stochastic error. Comparing u against
  the standard p tells you whether your error is over- or under-rotation vs
  random.

---

## Quantum volume

The **Quantum Volume** protocol (Cross et al. 2019). Runs square model circuits
— width = depth, each layer a random permutation paired up with Haar-random
SU(4) gates — and measures the **heavy-output probability** (HOP): the chance
of sampling a bitstring whose ideal probability exceeds the median.

**When available.** Run on click; the "device" is the noise model, so a clean
model passes every reachable width and noise pulls HOP down.

**What you see.** HOP with 2σ error bars per width 2–5 against the 2/3 threshold
and the ideal-HOP reference (1+ln2)/2 ≈ 0.85. A width **passes** when its 2σ
lower bound clears 2/3 (green); the achieved **QV = 2^(largest passing width)**.

---

## Mirror / volumetric

**Mirror (volumetric) benchmarking** (Proctor et al. 2022). Runs random
Clifford-layer circuits followed by their exact inverse — so the ideal output
is |0…0⟩ — over a **width × depth grid**, and shows the success probability
P(|0…0⟩) as a heatmap.

**When available.** Run on click; needs the noise model enabled to show
structure (a clean model is 1 everywhere).

**What you see.** A grid coloured red (failed) → green (success); the frontier
where success drops to ½ traces the largest circuit shapes the device can still
execute. SPAM-light and scalable — no full-circuit Clifford recovery needed.

---

## Cross-entropy benchmarking

**XEB** (Google supremacy-style). Runs random brickwork circuits (random √X/√Y/T
single-qubit gates + CZ entanglers) at growing cycle counts and computes the
**linear XEB fidelity** Σ(p_noisy−1/D)(p_ideal−1/D) / Σ(p_ideal−1/D)² — 1 for a
perfect device, 0 for the uniform distribution.

**When available.** Run on click; enable the noise model to see the decay.

**What you see.** Fidelity dots vs depth with the fitted per-cycle decay λ.
Computed exactly from the full distributions (no shot sampling), so a clean
model returns ≈ 1 at every depth.

---

## Simultaneous RB (crosstalk)

**Simultaneous randomized benchmarking** — the crosstalk / addressability test
(Gambetta et al. 2012). Runs single-qubit RB on each qubit isolated vs with
every qubit driven at once and compares the error per Clifford.

**When available.** Run on click; needs the noise model's **crosstalk** rate
(and ideally a coupling map) set to show an effect.

**What you see.** Isolated vs simultaneous EPC bars per qubit, plus the mean
**addressability** ratio EPC_simul/EPC_iso (1 ⇒ perfectly addressable). Isolated
and simultaneous use the *same* random sequences and trajectory randomness, so
with crosstalk 0 the ratio is exactly 1; the spectator model adds
`crosstalk × (coupled neighbours)` depolarising under simultaneous driving.

---

## T1 / T2 experiments

The standard coherence-time experiments, with the idle delay measured in
**gate-times** (each idle is one identity gate, so the noise model's per-gate
damping accumulates).

- **T1** (inversion recovery): prepare |1⟩, idle, read P(|1⟩) → fits T1.
- **T2\*** (Ramsey): prepare |+⟩, idle, H, read P(|0⟩) → fits T2.

**When available.** Run on click; needs amplitude / phase damping set in the
Noise panel to decay.

**What you see.** Both decay curves with the fitted T1 / T2 (in gate-times) and
the ½ floor. Physically T2 ≤ 2·T1.

---

## Pauli error budget

A transparent decomposition of the noise model into each qubit's **per-gate
X/Y/Z error** via the Pauli-twirl approximation: depolarising contributes
p₁/3 to each Pauli, amplitude damping p_X = p_Y = γ/4 (small p_Z), phase
damping a pure Z = (1 − √(1−γ))/2.

**When available.** Needs the noise model enabled; exact and instant (no
simulation).

**What you see.** Stacked X/Y/Z bars per qubit with a readout-error tick and
the total per-qubit gate error. Use it to see which error channel dominates and
on which qubits.

---

## Readout-error mitigation

Real measurement is noisy — a prepared |0⟩ is sometimes read as 1. This
panel takes the ideal output distribution, applies the noise model's
symmetric readout bit-flip to get the "measured" distribution, then inverts
the (tensor-structured) confusion matrix to recover a corrected estimate.
Ideal / measured / corrected are shown as three bars per top basis state,
with the L1 error to the ideal before and after, and any negative mass that
was clipped (a flag that the inversion is getting ill-conditioned). Needs
the Noise panel enabled with a non-zero readout rate; statevector path; ≤ 8
qubits.

---

## Classical shadows

Randomized-measurement state estimation (Huang–Kueng–Preskill). Click to
sample N snapshots, each measuring every qubit in a random X/Y/Z basis;
from those snapshots the panel estimates observables with no tailored
circuit per observable. It plots the per-qubit ⟨Z⟩ shadow estimate (dot)
against the exact value (marker) on a [−1, 1] axis, and estimates any Pauli
string you type (shadow vs exact). Increase the shot count to tighten the
estimates. Run on click; statevector path; ≤ 12 qubits.

---

## State preparation (synthesis)

Type a target statevector — an amplitude list of 2ⁿ values (reals or `a+bi`
complex) or a basis-state label like `011` — and synthesize a circuit of
RY/RZ/CX gates that prepares it from |0…0⟩ (Möttönen amplitude/phase
encoding). Presets cover Bell, W, GHZ, a basis state, and a phased pair.
Shows the synthesized gate / CX / depth counts and opens the result in a new
tab. Exact up to global phase; ≤ 8 qubits.

---

## Unitary synthesis (two-level)

One click re-expresses the current circuit's full 2ⁿ×2ⁿ unitary as an
equivalent circuit of controlled-`u_arb` two-level gates (Gray-ordered
Givens decomposition) — a *universal* decomposition, though not
CNOT-optimal like Quantum Shannon Decomposition. The result opens in a new
tab; the Equivalence panel confirms it matches the original. ≤ 4 qubits
(the gate count grows as O(4ⁿ)).

---

## QEC workbench (repetition)

A quantum-error-correction workbench for the **bit-flip repetition code** with
a real **syndrome → minimum-weight lookup decoder**. Sweeps the physical
error rate p, decodes each Monte-Carlo shot, and plots the **logical error
rate** for distances 3 / 5 / 7 against the break-even diagonal
(logical = physical).

**When available.** Run on click (self-contained; sweeps p internally).

**What you see.** The three distance curves cross at the **threshold p = ½**
(marked): below it a larger distance suppresses errors exponentially, above it
a larger distance is worse. The exact rate is the binomial tail
Σ_{k>d/2} C(d,k) pᵏ(1−p)^{d−k}; the panel runs the actual lookup decoder over
4000 shots per point so you see real (slightly noisy) decoded curves.

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

**Rendered replies.** Assistant messages render as **markdown** —
headings, lists, tables, bold/italic, inline code — and **LaTeX via
KaTeX**: inline `$…$` / `\(…\)` and display `$$…$$` / `\[…\]`, including
Dirac braket macros (`\ket`, `\bra`, `\braket`, `\expval`, `\tr`). Your
own messages stay literal, and fenced QASM blocks keep their
code-block + auto-open treatment.

**Tip.** Use it as a tutor, not an oracle. The LLM is great at
explaining concepts and proposing sequence changes; verify any
non-trivial output by running it in the simulator before trusting.

---

## Page curve

The entanglement-entropy profile S(ρ_A) across every contiguous cut, with
two reference curves overlaid: the analytic **Page value** of a Haar-random
pure state (the average entropy a maximally-scrambled state would have) and
the maximal bound min(|A|, |B|) bits. A volume-law / thermalised state hugs
the Page arch peaking at the half-cut; a gapped ground state stays flat near
zero (area law); a product state is identically zero.

**When available.** Statevector path only (not Clifford / noise). n ≤ 14.

**Tip.** The "mean |S − S_Page|" readout is a one-number scrambling score:
near zero means the state looks Haar-random across cuts.

---

## Tripartite information I₃

I₃(A:B:C) = I(A:B) + I(A:C) − I(A:BC) for three chosen single qubits, with
the rest of the register as the implicit fourth region. A scrambling channel
drives I₃ **negative** — information about A is recoverable only from the
joint BC, not from B or C alone — and a constant negative term also witnesses
topological order. The three pairwise mutual informations are shown as bars
beneath the I₃ verdict.

**When available.** Statevector path only. n ≥ 4 (three regions + a remainder).

---

## Entanglement spectrum (Li–Haldane)

The "entanglement energies" ξ_i = −ln λ_i of the reduced density matrix ρ_A
across a chosen cut, drawn as a level diagram (lowest level = largest Schmidt
weight, highlighted). Where the **Entanglement spectrum** (Schmidt) panel
plots the squared coefficients λ_i, this plots their logarithms — the
spectrum of the entanglement Hamiltonian H_E = −ln ρ_A, whose low-lying
counting and gaps are the Li–Haldane fingerprint of topological order.

**When available.** Statevector path only. Smaller side of the cut ≤ 6 qubits.

---

## Counting statistics

The full probability distribution P(m) of the excitation number
N_A = Σ_{i∈A} |1⟩⟨1| in a chosen subregion A (bars over m = 0 … |A|), with its
mean (filling) and **variance**. The variance is the bipartite charge
fluctuation — a cheap, experimentally accessible proxy that grows with the
entanglement entropy for U(1)-symmetric states.

**When available.** Statevector path only. n ≤ 18.

---

## Spin squeezing ξ²

The Wineland squeezing parameter ξ²_R = N (ΔJ_⊥,min)² / |⟨J⟩|² for the
collective spin J = ½ Σ σ. A gauge on a 0…2 scale marks the standard quantum
limit (ξ² = 1): **ξ² < 1 certifies metrological squeezing** useful beyond
shot noise *and* witnesses multipartite entanglement, with the gain reported
in dB. States with zero mean spin (e.g. GHZ) make ξ² undefined — the panel
says so and points you to the QFI panel, the right witness there.

**When available.** Statevector path only. n ≤ 14.

---

## Observable variance & shot noise

For a Pauli-sum observable H = Σ h_k P_k (entered with the same grammar as the
Hamiltonian panels, with presets), reports ⟨H⟩, Var(H) = ⟨H²⟩ − ⟨H⟩², the
standard deviation σ, and the **standard error σ/√N** of an N-shot estimate
(N selectable). This is what makes the otherwise-exact Expectation panel
honest about the finite-sampling cost a VQE energy evaluation actually pays.

**When available.** Statevector path only.

---

## Characteristic function

The discrete characteristic function |χ(u,v)| = |⟨D(u,v)⟩| on the
Heisenberg–Weyl (Pauli) lattice — the Fourier dual of the Wigner panel. Rows
index the X-support u, columns the Z-support v; χ(0,0) = 1 always. A
stabilizer state shows a flat ±1 comb; generic states spread mass over the
lattice, the complementary picture to Wigner negativity.

**When available.** Statevector path only. n ≤ 4.

---

## Density imbalance I(t)

The staggered (charge-density-wave) imbalance I(t) = (1/n) Σ_i (−1)^i ⟨Z_i⟩(t)
swept over one period of the `t` clock — the canonical MBL-vs-thermalization
diagnostic. Thermalising dynamics relax I → 0 (the density pattern washes
out); a many-body-localized phase saturates to a non-zero plateau (memory of
the initial state is retained). The "plateau" readout averages |I| over the
back half of the window.

**When available.** Statevector path only. n ≤ 14.

---

## Butterfly velocity (OTOC cone)

Runs the OTOC with the butterfly Z on qubit 0 and the measurement Z on each
other qubit, extracts the threshold-crossing **arrival time** t*(r) of the
scrambling front at distance r, and linearly fits r ≈ v_B · t* — the emergent
"speed of information" of the circuit. Plots arrival time vs distance with the
fit line. Runs **on demand** (dense-unitary OTOC per qubit).

**When available.** 2 ≤ n ≤ 5.

---

## Density of states

A histogram of the exact energy spectrum of a Pauli-sum Hamiltonian (entered
with presets). Where the Hamiltonian-spectrum panel draws individual levels,
this coarse-grains them so the spectrum's *shape* is legible: a Gaussian bulk
(generic many-body H), spectral edges, gaps, and degeneracy spikes. On-demand
diagonalisation, n ≤ 7.

---

## Berry phase (Wilson loop)

The geometric (Pancharatnam–Berry) phase γ = −arg Π⟨ψ_k|ψ_{k+1}⟩ the prepared
state acquires on a closed rectangular loop in the plane of two chosen free
symbols (centred on their current values, with a selectable radius). It is
gauge-invariant: a quantized **γ ≈ π** signals a topological / Zak winding,
γ ≈ 0 a trivial loop. Complements the QGT panel, which reports the Berry
*curvature* this integrates over a finite loop. The reported overlap magnitude
drops toward zero when the loop nears a degeneracy.

**When available.** Statevector path, no mid-circuit measurement, ≥ 2 free
symbols, n ≤ 12.

---

## Entanglement contour

The per-site incremental entanglement entropy s(j) = S([0..j]) − S([0..j−1])
across a contiguous region [0..m−1] (region size selectable). The bars sum
exactly to S(A) and show *where* the region's entanglement sits: a flat
profile is volume-law, a profile peaked at the region boundary is area-law,
and a negative bar flags a site whose inclusion lowers the entropy.

**When available.** Statevector path only. Region ≤ 7 qubits.

---

## Schmidt gap

Δλ(k) = λ₁ − λ₂, the gap between the two largest squared Schmidt coefficients
of ρ_{[0..k]}, plotted across every contiguous cut. It is an order parameter
for symmetry-protected topological transitions: the gap stays open in a
gapped phase and **closes** at criticality, where the entanglement spectrum
becomes degenerate.

**When available.** Statevector path only. Smaller side of the cut ≤ 8.

---

## Rényi entropy spectrum

S_α(ρ_A) as a function of the Rényi index α for a chosen cut. A flat curve
signals a near-uniform (volume-law) entanglement spectrum; a steep one means
a few dominant Schmidt weights. The α → 0 limit is the log Schmidt rank,
α → ∞ the min-entropy −log₂ λ_max; the α = 1 line marks the von Neumann
value.

**When available.** Statevector path only. Smaller side of the cut ≤ 6.

---

## Correlation length ξ

Fits the connected correlator g(r) = mean_{|i−j|=r} |⟨ZᵢZⱼ⟩_c| to
ln g(r) = −r/ξ + const (log axis, with the exponential fit overlaid). ξ is
short in a gapped phase and diverges toward a critical point. A uniformly
correlated state (e.g. GHZ) reports ξ → ∞.

**When available.** Statevector path only. n ≤ 16.

---

## Operator weight growth

The Pauli-support distribution of the Heisenberg-evolved operator
Z(t) = U_t† Z₀ U_t, swept over the `t` clock and bucketed by weight (number
of non-identity factors), drawn as a heatmap (rows = weight, columns = time).
Each column sums to 1; weight starts concentrated at 1 and migrates upward as
the operator scrambles — the microscopic picture under the butterfly
velocity. Runs **on demand** (dense unitary per time sample).

**When available.** n ≤ 4.

---

## Work distribution (TPM)

The two-point-measurement work distribution P(W) for a quench: measure the
energy of a Hamiltonian H (entered as a Pauli sum) on |0…0⟩, apply the circuit
as the quench unitary, then measure H again. The histogram of work
W = Eₘ − Eₙ (weighted by the transition probabilities) is the central object
of quantum fluctuation theorems (Jarzynski / Crooks); a W = 0 line is marked.
Runs **on demand** (H diagonalisation + dense unitary).

**When available.** n ≤ 5; H must act on the same number of qubits as the
circuit.

---

## Majorana stars

The stellar (Majorana) representation: the n-qubit state projected onto the
symmetric spin-J = n/2 subspace, drawn as n "stars" on the Bloch sphere (the
roots of the Majorana polynomial). The constellation is rotation-covariant —
|0…0⟩ stacks all stars at the north pole, GHZ spreads them in a ring, Dicke
states sit on a latitude. The reported symmetric weight says how much of the
state lives in the symmetric subspace the picture represents.

**When available.** Statevector path only. n ≤ 6.

---

## Magic spectrum M_α

The stabilizer-Rényi nonstabilizerness M_α swept over the Rényi index α,
generalising the single M₂ of the Magic panel. M_α ≥ 0 and vanishes for every
α iff the state is a stabilizer state; the curve's shape distinguishes states
with the same M₂ but different magic structure.

**When available.** Statevector path only. n ≤ 6.

---

## QFI matrix (multiparameter)

The quantum Fisher information *matrix* F_{ab} = 4·Cov(J_a, J_b) over the
collective-spin generators {Jx, Jy, Jz}, as a 3×3 heatmap. Its largest
eigenvalue is the best single-axis QFI (what the scalar QFI panel reports for
the optimal direction); det F bounds the joint estimation of several phases
(the multiparameter Cramér–Rao bound). The maximum eigenvalue exceeding N
witnesses entanglement.

**When available.** Statevector path only. n ≤ 14.

---

## Mixed-state spectrum

The eigenvalue spectrum of the trajectory-averaged output density matrix ρ
under the noise model. A noiseless channel gives a pure output ({1, 0, …});
decoherence spreads the weight, and the effective rank 1/Σ p² counts how many
components contribute (how far the output is from pure). Reports the spectrum,
purity Tr(ρ²), effective rank, and S(ρ).

**When available.** Requires noise mode on. n ≤ 6.

---

## MPS bond dimension

The matrix-product-state bond dimension χ needed per contiguous cut to
represent the state within a target truncation error (selectable ε), plus the
maximum χ over all cuts and the worst-cut error-vs-χ readout. A product state
needs χ = 1; a volume-law state needs χ growing exponentially with the cut
size — so this answers "could this state be stored as an MPS, and how big?".

**When available.** Statevector path only. Smaller side of the cut ≤ 8.

---

## Negativity spectrum

The eigenvalues of the partial transpose ρ^{T_A} across a chosen cut, sorted
as a bar chart. The **negative** eigenvalues (orange) are the entanglement
signal: 𝒩 = Σ|λ₋| and the log-negativity E_N = log₂(2𝒩+1). Distinct from the
pairwise Negativity panel (one scalar per qubit pair) — this resolves an
arbitrary bipartition.

**When available.** Statevector path only. n ≤ 6 (builds the full ρ).

---

## Three-tangle (monogamy)

For a pure 3-qubit state, the Coffman–Kundu–Wootters residual tangle τ₃ =
τ_{a(bc)} − C²_{ab} − C²_{ac}, drawn as a stacked bar splitting the focal
qubit's one-tangle into its two pairwise squared concurrences and the genuine
tripartite residual. τ₃ = 1 for GHZ and 0 for W — the clean GHZ-vs-W
discriminator.

**When available.** Statevector path only. Exactly 3 qubits.

---

## Total correlation

The multi-information C = Σ_i S(ρ_i) − S(ρ), the all-parties generalization of
mutual information; for a pure state it is Σ_i S(ρ_i), shown as per-qubit bars
plus the total. Captures the total correlation distributed across every qubit
at once. Product state ⇒ 0; GHZ ⇒ n bits.

**When available.** Statevector path only. n ≤ 14.

---

## Entanglement velocity dS/dt

The half-chain entanglement entropy S(t) over the `t` clock, with the maximum
slope dS/dt marked — the entanglement velocity v_E of the "entanglement
tsunami" after a quench. A static circuit reads 0; a spreading circuit shows
a linear ramp.

**When available.** Statevector path only. n ≤ 12, half-cut side ≤ 6.

---

## Anticoncentration (Porter–Thomas)

Histograms the rescaled output probabilities y = 2ⁿ·|⟨x|ψ⟩|² against the
Porter–Thomas law e^{−y} that a Haar-random circuit follows. The collision
ratio R = 2ⁿ·Σ p² is the sharp scalar: R = 1 (flat), R = 2 (anticoncentrated /
Porter–Thomas), R ≫ 2 (peaked). The distribution underpinning random-circuit
sampling and linear XEB.

**When available.** Statevector path only. n ≤ 16.

---

## Effective temperature (ETH)

Fits a Boltzmann law p_k ∝ e^{−βE_k} to the diagonal-ensemble energy
populations of the current state under a chosen Hamiltonian, plotting ln p_k
vs E_k with the fit. A straight line (high R²) is direct evidence of
eigenstate thermalisation; the slope gives the effective β (and T = 1/β).

**When available.** Statevector path only. n ≤ 6.

---

## Coherent information

I_c(A⟩B) = S(ρ_B) − S(ρ) for a bipartition of the **noisy** state ρ — a lower
bound on one-way distillable entanglement and the quantum-channel capacity.
Positive I_c certifies that quantum information survives across the A|B cut;
it goes negative once decoherence has destroyed the quantum correlations.

**When available.** Requires noise mode on. n ≤ 6 (builds the full ρ).

---

## CHSH / Bell nonlocality

The maximal CHSH value per qubit pair via the Horodecki criterion
S_max = 2√(t₁²+t₂²), where t₁,t₂ are the two largest singular values of the
correlation matrix T_ij = ⟨σ_iσ_j⟩. A heatmap; cells with **S > 2** (orange)
are a device-independent certificate of Bell nonlocality — strictly stronger
than entanglement (some entangled states stay local). The Tsirelson bound is
2√2 ≈ 2.83.

**When available.** Statevector path only. n ≤ 12.

---

## Quantum discord

Pairwise quantum discord D(A|B) = I(A:B) − J(A:B) — the quantum correlation
that survives *beyond* entanglement (J is the most a projective measurement on
B can reveal about A, minimised over the measurement axis). D > 0 even for some
separable states, so it catches correlation that concurrence and negativity
miss. An asymmetric heatmap (row A, measured qubit B).

**When available.** Statevector path only. n ≤ 8 (per-pair measurement
optimisation).

---

## Entanglement-spectrum statistics

The consecutive-gap-ratio distribution of the entanglement energies
ξ_i = −ln λ_i across a cut. ⟨r⟩ ≈ 0.386 (Poisson) flags a localized / MBL
phase; ⟨r⟩ ≈ 0.536 (GOE) flags an ergodic / thermal phase — the level-
statistics diagnostic applied to the *entanglement* Hamiltonian rather than
the energy spectrum, with the two reference lines marked.

**When available.** Statevector path only. Smaller cut side ≤ 8.

---

## Multifractal spectrum D_q

The generalized fractal dimensions D_q of the wavefunction from the
inverse-participation moments I_q = Σ p_xᵍ. D_q ≈ 1 for all q is a fully
delocalised (ergodic) state; D_q ≈ 0 is localised; a curve that falls with q
is **multifractal** (the critical regime) — a finer localization probe than
the single IPR in the Participation panel.

**When available.** Statevector path only. n ≤ 16.

---

## Negativity dynamics

The logarithmic negativity across a chosen cut over one period of the `t`
clock, read cheaply from the Schmidt coefficients (E_N = 2 log₂ Σ√λ). Shows
entanglement growth, oscillation, and "sudden death / revival" — dips to zero
mark instants where the cut briefly disentangles.

**When available.** Statevector path only. n ≤ 12, smaller cut side ≤ 6.

---

## OTOC light-cone

The out-of-time-order correlator C(t) over the full (qubit, time) plane — the
butterfly Z on qubit 0, the measurement Z swept across every qubit and the `t`
clock, as a heatmap. The rising wavefront is the operator light-cone (its slope
is the butterfly velocity). Runs **on demand** (dense-unitary OTOC per qubit).

**When available.** 2 ≤ n ≤ 5.

---

## ETH off-diagonal elements

Scatters |⟨E_m|O|E_n⟩|² against the energy difference ω = E_m − E_n for an
entered Hamiltonian H and observable O. A thermalising H shows a smooth,
small-magnitude envelope (the ETH ansatz f(ω)); an integrable / MBL H shows
sparse, large, structured elements. The diagonal ⟨E_n|O|E_n⟩ vs E is the
microcanonical curve. Completes the thermalization story with the
diagonal-ensemble and effective-temperature panels. Runs **on demand**, n ≤ 5.

---

## Floquet quasi-energies

The eigenphases e^{iθ_k} of the circuit unitary (the one-period Floquet
operator) on the unit circle, plus the level-spacing gap-ratio ⟨r⟩
(Poisson ≈ 0.39 integrable vs circular-ensemble repulsion ≈ 0.53 chaotic).
Recovered from the commuting Hermitian parts of U via the Rayleigh-quotient
phase, so no general complex eigensolver is needed. Runs **on demand**, n ≤ 6.

---

## Eigenstate entanglement (ETH)

The half-chain entanglement entropy S(ρ_A) of every *energy eigenstate* of an
entered Pauli-sum Hamiltonian, scattered against energy. A thermalizing H (ETH)
shows a volume-law arch peaking mid-spectrum near the Page ceiling; an
integrable / MBL H shows low, scattered area-law points. This characterises
H's eigenstates, complementing the prepared-state panels (diagonal ensemble,
effective temperature, ETH off-diagonal). Runs **on demand**, n ≤ 6.

---

## Chern number

The topological Chern number of the prepared state over the 2-torus of two
free symbols, via the gauge-invariant Fukui–Hatsugai–Suzuki lattice flux
C = (1/2π) Σ F(k) (quantized to an integer). The per-plaquette Berry flux is
drawn as a curvature heatmap (blue +, orange −). A non-zero C is a topological
fingerprint. Tiles the whole torus, where the Berry-phase panel does one loop
and the QGT panel gives the local curvature. Needs ≥ 2 free symbols;
statevector path, n ≤ 12.

---

## Lyapunov exponent (OTOC)

Fits the early-time exponential growth of the OTOC, C(t) ∝ e^{λ_L t}, on a log
axis and reports the slope λ_L — the *temporal* growth rate of scrambling (the
companion to the spatial butterfly velocity). The fit uses the growth window
between a small floor and the approach to saturation. Statevector path, n ≤ 6.

---

## Temporal autocorrelation ⟨Z(t)Z(0)⟩

The infinite-temperature two-time autocorrelation C(t) = (1/2ⁿ) Tr[Z_q(t)Z_q(0)]
of a chosen qubit over the `t` clock, plus its spectral function (Fourier
transform). C(t) stays near 1 for a conserved / localized mode and decays to 0
for a thermalizing one; the spectrum's peaks are the relaxation frequencies.
State-independent; built from the dense unitary per sample, run **on demand**,
n ≤ 6.

---

## PT moments (p₃ criterion)

The partial-transpose moments p_n = Tr[(ρ^{T_A})ⁿ] across a cut, and the p₃-PPT
entanglement criterion (p₃ < p₂² ⇒ entangled). These are the moments a
randomized-measurement / classical-shadow protocol estimates directly without
full state reconstruction, so they are the practical entanglement probe for
noisy states; here they're computed exactly from the partial-transpose
eigenvalues. Statevector path, n ≤ 6.

---

## Selecting panels

Each panel header is a toggle — click it to expand or collapse that
panel. The **all** / **none** buttons at the right of the right-pane bar
(next to Record) expand or collapse *every* panel at once. Layout state
(open / closed per panel, ordering) persists per tab in local storage
(`quantiom:panel-collapsed:v1`).

Collapsed panels cost nothing per frame — the `PanelShell` publishes
its collapsed state via `usePanelCollapsed()`, and every expensive
`useMemo` body short-circuits at the top when collapsed. So feel free
to keep dozens of tabs open with many panels each; closed panels are
free.

**Enlarge a panel (spotlight).** Every panel header has a **⤢ grip** —
drag it onto the circuit, or click it, to enlarge that panel in a
resizable dock on the left of the canvas, right beside the circuit. The
panel keeps its exact state; the spot it left shows a click-to-restore
note. Drag the vertical splitter to size the dock (`quantiom:spotlight-w`),
and click the grip again (or the dock's ×) to put it back. Good for
watching one heatmap or trajectory closely while you edit.

**Plot sizing.** The data-plot panels (heatmaps, line charts, the
space-time maps) render as responsive SVGs that scale to fill the panel
width while preserving aspect ratio, so a wider window gives you bigger
plots. The space-time and pairwise-correlation maps draw grid lines so the
cell structure is visible even where a value is ~0.
