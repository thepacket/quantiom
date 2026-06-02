import type { Circuit, PlacedGate } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "./simulate";
import type { NoiseModel } from "./noise";
import { expandCustomGates } from "../editor/customGates";
import { buildMatrix } from "./matrices";
import { compileExpr } from "./expr";
import { rateFor } from "./noise";

/**
 * WebGPU-accelerated noisy trajectory simulator (first cut).
 *
 * Scope and limitations of this cut:
 *   • Applies only 1-qubit gates. 2-qubit gates make the caller fall
 *     back to the CPU path. Researchers running VQE ansätze that are
 *     dominated by 1q rotations + a few CNOTs won't see the speedup
 *     yet; researchers running pure-rotation circuits (ZZ-style
 *     diagnostics, single-qubit Trotter, parameter-shift gradients
 *     across many rotation gates) will.
 *   • Depolarising noise per gate. Amplitude/phase damping are not
 *     yet in the GPU path — when present, falls back to CPU.
 *   • FP32 precision. Apple Silicon, Adreno, Mali, and most consumer
 *     GPUs are FP32-only. For trajectory averaging across hundreds of
 *     runs the per-amplitude error stays well below the sampling
 *     noise floor.
 *   • Measurements / conditions / reset → CPU fallback.
 *
 * Pipeline:
 *   1. CPU walks the gate list, builds:
 *      • a `gateBuf` of {matrix, qubit, noise_rate} per 1q gate
 *      • a `rngBuf` of pre-computed per-(trajectory, gate) random doubles
 *        used to decide if a Pauli error fires and which one.
 *   2. Compute shader: one thread per (trajectory, basis-index pair),
 *      applies each gate sequentially with a workgroup barrier between
 *      gates so the whole per-trajectory state is consistent.
 *   3. Reduction pass: accumulate |ψ|² → probabilities[basis] (sum
 *      across trajectories, normalised by T).
 *   4. CPU reads back, computes Bloch from the averaged probabilities
 *      and an averaged off-diagonal pass.
 *
 * Returns `null` when WebGPU isn't usable or the circuit doesn't fit
 * the supported subset — the caller falls back to the CPU path.
 */

const WG_SIZE = 64;
const MAX_QUBITS_GPU = 14;        // 2^14 = 16k amplitudes per trajectory = 128 KB FP32
const MIN_TRAJ_FOR_GPU = 64;

export type GPUBlochVector = { x: number; y: number; z: number };
export type GPUPauli = "I" | "X" | "Y" | "Z";
export type WebGPUResult = {
  /** Per-qubit (⟨X⟩, ⟨Y⟩, ⟨Z⟩) averaged over all trajectories. Indexed by
   *  qubit number. Same convention as the CPU Bloch panel. */
  blochVectors?: GPUBlochVector[];
  probabilities: number[];
  trajectories: number;
  /** Trajectory-averaged ⟨P_k⟩ for each Pauli string in `paulisList`, in
   *  the order they were passed. Only present when the caller requested
   *  any Pauli expectations; the shader still emits Bloch + probabilities
   *  unconditionally. Each term re-uses the same simulated trajectories,
   *  so a K-term Hamiltonian only costs one trajectory pass (NOT K passes
   *  — that was the old behaviour, dispatched once per term). */
  pauliExpectations?: number[];
};

let cachedDevice: GPUDevice | null = null;
let cachedAdapter: GPUAdapter | null = null;
let probedFailed = false;

/** Cached WebGPU device acquisition. Returns null when unavailable. */
export async function getWebGPUDevice(): Promise<GPUDevice | null> {
  if (cachedDevice) return cachedDevice;
  if (probedFailed) return null;
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    probedFailed = true;
    return null;
  }
  try {
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
    if (!adapter) { probedFailed = true; return null; }
    cachedAdapter = adapter;
    const device = await adapter.requestDevice();
    cachedDevice = device;
    return device;
  } catch {
    probedFailed = true;
    return null;
  }
}

/** Synchronous "is WebGPU plausibly available" check used by UI. */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !probedFailed;
}

export function webGPUAdapterInfo(): string | null {
  if (!cachedAdapter) return null;
  const info = (cachedAdapter as GPUAdapter & { info?: { vendor?: string; architecture?: string } }).info;
  if (!info) return null;
  const parts = [info.vendor, info.architecture].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

/**
 * Try to run the circuit on the GPU. Returns the trajectory-averaged
 * probabilities, or null when the GPU path declines (caller falls back).
 *
 * The caller (`simulateNoisy.ts`) is responsible for checking this
 * function's nullness and routing to the CPU path on null.
 */
export async function tryRunWebGPUTrajectories(
  circuit: Circuit,
  paramValues: ParameterValues,
  customGates: CustomGate[],
  noise: NoiseModel,
  T: number,
  /** Optional list of Pauli strings to compute trajectory-averaged ⟨P_k⟩
   *  for. Each entry has length `circuit.numQubits`; entries are
   *  "I"/"X"/"Y"/"Z" with big-endian indexing. All K strings share the
   *  one simulated trajectory set so the cost is essentially K independent
   *  reductions, not K full trajectory passes. */
  paulisList?: GPUPauli[][],
): Promise<WebGPUResult | null> {
  const n = circuit.numQubits;
  if (n > MAX_QUBITS_GPU) return null;
  if (T < MIN_TRAJ_FOR_GPU) return null;
  if (noise.amplitudeDamping > 0 || noise.phaseDamping > 0) return null;
  if (noise.customKraus?.enabled) return null;
  // Per-qubit damping rates — fall back if any are set.
  if (noise.perQubit?.some((p) => (p.amplitudeDamping ?? 0) > 0 || (p.phaseDamping ?? 0) > 0)) return null;

  const expanded = expandCustomGates(circuit.gates, customGates);
  const sorted = [...expanded].sort((a, b) =>
    a.column !== b.column ? a.column - b.column : a.id.localeCompare(b.id),
  );

  // Filter to gates we support: 1-qubit unitary, no controls, no condition,
  // no anti-controls, no measurement / reset / barrier / init.
  type Op = { matrix: Float32Array; qubit: number; rate: number };
  const ops: Op[] = [];
  for (const g of sorted) {
    if (!isPureSingleQubitGate(g)) return null;
    const params = g.params.map((p) => evalParam(p, paramValues));
    const U = buildMatrix(g.gateId, params, 0);
    if (!U) return null;
    const flat = new Float32Array(8);
    flat[0] = U[0][0][0]; flat[1] = U[0][0][1];
    flat[2] = U[0][1][0]; flat[3] = U[0][1][1];
    flat[4] = U[1][0][0]; flat[5] = U[1][0][1];
    flat[6] = U[1][1][0]; flat[7] = U[1][1][1];
    const q = g.targets[0];
    const perGate = noise.perGate?.[g.gateId];
    const rate = perGate ?? rateFor(noise, "oneQubitDepolarising", q);
    ops.push({ matrix: flat, qubit: q, rate });
  }
  if (ops.length === 0) {
    // Trivial circuit — just return |0⟩.
    const probs = new Array<number>(1 << n).fill(0);
    probs[0] = 1;
    return { probabilities: probs, trajectories: T };
  }

  const device = await getWebGPUDevice();
  if (!device) return null;

  // Encode each Pauli string as (flipMask, signMask, numYMod4) — the
  // shader consumes a compact list rather than per-qubit codes so it can
  // loop over K terms with O(K · dim) work after the trajectory pass.
  let pauliEncoded: Uint32Array | null = null;
  if (paulisList && paulisList.length > 0) {
    const K = paulisList.length;
    pauliEncoded = new Uint32Array(K * 4); // (flip, sign, numYmod4, _pad)
    for (let k = 0; k < K; k++) {
      const ps = paulisList[k];
      if (ps.length !== n) return null;
      let flip = 0, sign = 0, numY = 0;
      for (let q = 0; q < n; q++) {
        const code = ps[q] === "X" ? 1 : ps[q] === "Y" ? 2 : ps[q] === "Z" ? 3 : 0;
        if (code === 0) continue;
        const qmask = 1 << (n - 1 - q);
        if (code === 1 || code === 2) flip |= qmask;
        if (code === 3 || code === 2) sign |= qmask;
        if (code === 2) numY++;
      }
      pauliEncoded[k * 4] = flip;
      pauliEncoded[k * 4 + 1] = sign;
      pauliEncoded[k * 4 + 2] = numY & 3;
      pauliEncoded[k * 4 + 3] = 0;
    }
  }

  try {
    return await dispatchGPU(device, n, T, ops, pauliEncoded);
  } catch (err) {
    console.warn("WebGPU dispatch failed, falling back to CPU:", err);
    return null;
  }
}

function isPureSingleQubitGate(g: PlacedGate): boolean {
  if (g.controls.length !== 0) return false;
  if (g.targets.length !== 1) return false;
  if (g.condition) return false;
  if (g.controlStates?.some((s) => !s)) return false;
  if (g.gateId === "barrier" || g.gateId === "delay") return false;
  if (g.gateId === "measure" || g.gateId === "measure_x" || g.gateId === "measure_y") return false;
  if (g.gateId === "reset") return false;
  if (g.gateId.startsWith("init")) return false;
  if (g.gateId === "if" || g.gateId === "while" || g.gateId === "switch" || g.gateId === "box") return false;
  // Single-qubit unitary catalog
  const oneQubit = new Set([
    "i", "x", "y", "z", "h", "s", "sdg", "sx", "sxdg", "t", "tdg",
    "p", "rx", "ry", "rz", "u", "u1", "u2", "u3", "u_arb",
  ]);
  return oneQubit.has(g.gateId);
}

async function dispatchGPU(
  device: GPUDevice,
  n: number,
  T: number,
  ops: Array<{ matrix: Float32Array; qubit: number; rate: number }>,
  pauliEncoded: Uint32Array | null,
): Promise<WebGPUResult> {
  const dim = 1 << n;

  // ── Buffers ──────────────────────────────────────────────────────────
  // State: T × dim × (re, im) FP32. T * dim * 2 * 4 bytes.
  const stateBytes = T * dim * 2 * 4;
  const stateBuf = device.createBuffer({
    size: stateBytes,
    usage: GPUBufferUsage.STORAGE,
  });

  // Gate operations: matrix (8 floats) + qubit (u32) + rate (f32) — 40 bytes per op, 16-aligned.
  // Lay out as a tight struct array; 40-byte structs align to 48 with padding.
  // We use a single packed Float32Array (40 floats per op for clarity).
  const opStride = 12; // 10 floats actually used (8 matrix + qubit + rate), padded to 12 for 16-byte alignment safety
  const opData = new Float32Array(ops.length * opStride);
  for (let i = 0; i < ops.length; i++) {
    const base = i * opStride;
    opData.set(ops[i].matrix, base);
    new Uint32Array(opData.buffer, opData.byteOffset + (base + 8) * 4, 1)[0] = ops[i].qubit;
    opData[base + 9] = ops[i].rate;
  }
  const opsBuf = device.createBuffer({
    size: opData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(opsBuf, 0, opData);

  // Per-(trajectory, op) pre-rolled randoms: 2 floats each (one for fire?, one for which Pauli).
  const rngData = new Float32Array(T * ops.length * 2);
  for (let i = 0; i < rngData.length; i++) rngData[i] = Math.random();
  const rngBuf = device.createBuffer({
    size: rngData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(rngBuf, 0, rngData);

  // Accumulated probabilities: dim FP32, written by all trajectories via atomic ops on a u32 staging buffer would be ideal but FP atomics are not portable. Use one buffer per workgroup then reduce on CPU.
  const probsBuf = device.createBuffer({
    size: T * dim * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Per-(trajectory, qubit) Bloch vectors (x, y, z, _pad) = 16 bytes per slot.
  const blochBytes = T * n * 4 * 4;
  const blochBuf = device.createBuffer({
    size: blochBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // K = number of Pauli strings to evaluate. The shader's bind layout is
  // fixed regardless of K — the terms storage buffer just gets sized to
  // the request. When K = 0 we still allocate 1 slot so the binding is
  // valid; the shader's outer loop short-circuits when numPaulis == 0.
  const numPaulis = pauliEncoded ? pauliEncoded.length / 4 : 0;
  const termsData = pauliEncoded ?? new Uint32Array(4);
  const termsBuf = device.createBuffer({
    size: Math.max(16, termsData.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(termsBuf, 0, termsData as BufferSource);

  // Uniforms: n, dim, T, numOps, numPaulis. Pad to 32 bytes (8 u32s).
  const uniformData = new Uint32Array([n, dim, T, ops.length, numPaulis, 0, 0, 0]);
  const uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, uniformData);

  // Per-(trajectory, term) Pauli expectation slot — laid out as
  // pauliExp[k * T + t] so the CPU's per-term average is a contiguous
  // read. When numPaulis = 0 we still allocate 1 trajectory slot to keep
  // the binding valid; the shader skips the write in that case.
  const pauliBytes = Math.max(4, T * Math.max(1, numPaulis) * 4);
  const pauliExpBuf = device.createBuffer({
    size: pauliBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // ── Shader ───────────────────────────────────────────────────────────
  const wgsl = /* wgsl */ `
struct Uniforms {
  n: u32, dim: u32, T: u32, numOps: u32,
  numPaulis: u32, _pad0: u32, _pad1: u32, _pad2: u32,
};
struct PauliTerm { flipMask: u32, signMask: u32, numYMod4: u32, _pad: u32, };
struct Op {
  m00r: f32, m00i: f32, m01r: f32, m01i: f32,
  m10r: f32, m10i: f32, m11r: f32, m11i: f32,
  qubit: u32, rate: f32, _pad0: f32, _pad1: f32,
};

@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<storage, read> ops: array<Op>;
@group(0) @binding(2) var<storage, read> rngs: array<f32>;
@group(0) @binding(3) var<storage, read_write> probs: array<f32>;
@group(0) @binding(4) var<uniform> U: Uniforms;
// Per-(trajectory, qubit) Bloch vectors: stride 4 floats (x, y, z, _pad)
// for tidy 16-byte rows.
@group(0) @binding(5) var<storage, read_write> bloch: array<f32>;
@group(0) @binding(6) var<storage, read_write> pauliExp: array<f32>;
@group(0) @binding(7) var<storage, read> pauliTerms: array<PauliTerm>;

fn popcount32(x: u32) -> u32 {
  var v = x;
  v = v - ((v >> 1u) & 0x55555555u);
  v = (v & 0x33333333u) + ((v >> 2u) & 0x33333333u);
  return (((v + (v >> 4u)) & 0x0F0F0F0Fu) * 0x01010101u) >> 24u;
}

fn stateIdx(t: u32, b: u32) -> u32 { return (t * U.dim + b) * 2u; }

fn apply1qGate(t: u32, q: u32, m00r: f32, m00i: f32, m01r: f32, m01i: f32,
               m10r: f32, m10i: f32, m11r: f32, m11i: f32) {
  let mask = 1u << (U.n - 1u - q);
  let half = U.dim >> 1u;
  for (var k: u32 = 0u; k < half; k = k + 1u) {
    // Distribute k over the "other" bits, leaving qubit q's bit at 0.
    var i: u32 = 0u;
    var rem = k;
    for (var b: u32 = 0u; b < U.n; b = b + 1u) {
      if (b == q) { continue; }
      let bitMask = 1u << (U.n - 1u - b);
      if ((rem & 1u) != 0u) { i = i | bitMask; }
      rem = rem >> 1u;
    }
    let j = i | mask;
    let idxI = stateIdx(t, i);
    let idxJ = stateIdx(t, j);
    let a_re = state[idxI];     let a_im = state[idxI + 1u];
    let b_re = state[idxJ];     let b_im = state[idxJ + 1u];
    // out0 = m00 * a + m01 * b
    state[idxI]      = m00r*a_re - m00i*a_im + m01r*b_re - m01i*b_im;
    state[idxI + 1u] = m00r*a_im + m00i*a_re + m01r*b_im + m01i*b_re;
    // out1 = m10 * a + m11 * b
    state[idxJ]      = m10r*a_re - m10i*a_im + m11r*b_re - m11i*b_im;
    state[idxJ + 1u] = m10r*a_im + m10i*a_re + m11r*b_im + m11i*b_re;
  }
}

fn applyPauli(t: u32, q: u32, pick: f32) {
  // pick in [0, 1): split into thirds for X, Y, Z.
  if (pick < 0.3333) {
    // X: same as a 1q gate with [[0,1],[1,0]]
    apply1qGate(t, q, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0);
  } else if (pick < 0.6667) {
    // Y: [[0,-i],[i,0]]
    apply1qGate(t, q, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 0.0);
  } else {
    // Z: [[1,0],[0,-1]]
    apply1qGate(t, q, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0);
  }
}

@compute @workgroup_size(${WG_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  if (t >= U.T) { return; }

  // Init state to |0⟩ for this trajectory.
  let base = t * U.dim * 2u;
  for (var i: u32 = 0u; i < U.dim * 2u; i = i + 1u) {
    state[base + i] = 0.0;
  }
  state[base] = 1.0;

  for (var k: u32 = 0u; k < U.numOps; k = k + 1u) {
    let op = ops[k];
    apply1qGate(t, op.qubit, op.m00r, op.m00i, op.m01r, op.m01i, op.m10r, op.m10i, op.m11r, op.m11i);
    if (op.rate > 0.0) {
      let rngBase = (t * U.numOps + k) * 2u;
      let fireRng = rngs[rngBase];
      if (fireRng < op.rate) {
        applyPauli(t, op.qubit, rngs[rngBase + 1u]);
      }
    }
  }

  // Accumulate |ψ|² into per-trajectory slot of probs.
  for (var b: u32 = 0u; b < U.dim; b = b + 1u) {
    let idx = stateIdx(t, b);
    let re = state[idx];
    let im = state[idx + 1u];
    probs[t * U.dim + b] = re*re + im*im;
  }

  // Per-qubit Bloch expectations for this trajectory.
  // ⟨Z_q⟩ = Σ_b (1 - 2·bit_q(b)) · |amp[b]|²
  // ⟨X_q⟩ = 2·Re Σ_{b with bit_q(b)=0} conj(amp[b]) · amp[b ⊕ mask_q]
  // ⟨Y_q⟩ = 2·Im Σ_{b with bit_q(b)=0} conj(amp[b]) · amp[b ⊕ mask_q]
  for (var q: u32 = 0u; q < U.n; q = q + 1u) {
    let mask = 1u << (U.n - 1u - q);
    var z: f32 = 0.0;
    var x: f32 = 0.0;
    var y: f32 = 0.0;
    for (var b: u32 = 0u; b < U.dim; b = b + 1u) {
      let bit = (b & mask) != 0u;
      let idx = stateIdx(t, b);
      let re = state[idx];
      let im = state[idx + 1u];
      let p = re*re + im*im;
      if (bit) { z = z - p; } else { z = z + p; }
      // X/Y: only loop over bit=0 to pair each |..0..⟩ with its partner |..1..⟩.
      if (!bit) {
        let idxJ = stateIdx(t, b | mask);
        let pre = state[idxJ];
        let pim = state[idxJ + 1u];
        // conj(amp[b]) · amp[b|mask] = (re - i·im) · (pre + i·pim)
        //   re part: re*pre + im*pim
        //   im part: re*pim - im*pre
        x = x + 2.0 * (re*pre + im*pim);
        y = y + 2.0 * (re*pim - im*pre);
      }
    }
    let bBase = (t * U.n + q) * 4u;
    bloch[bBase] = x;
    bloch[bBase + 1u] = y;
    bloch[bBase + 2u] = z;
    bloch[bBase + 3u] = 0.0;
  }

  // Multi-qubit Pauli expectations, one per term in the input list. The
  // outer loop runs K times over the same trajectory state, so a K-term
  // Hamiltonian costs one trajectory pass + K·dim reductions (vs. the
  // old per-term dispatch path which re-simulated K times).
  for (var k: u32 = 0u; k < U.numPaulis; k = k + 1u) {
    let term = pauliTerms[k];
    let flipMask = term.flipMask;
    let signMask = term.signMask;
    let iPow = term.numYMod4;  // 0:1, 1:i, 2:-1, 3:-i
    var iPowRe: f32 = 0.0;
    var iPowIm: f32 = 0.0;
    if (iPow == 0u)      { iPowRe = 1.0;  iPowIm = 0.0; }
    else if (iPow == 1u) { iPowRe = 0.0;  iPowIm = 1.0; }
    else if (iPow == 2u) { iPowRe = -1.0; iPowIm = 0.0; }
    else                 { iPowRe = 0.0;  iPowIm = -1.0; }
    var pe: f32 = 0.0;
    for (var b: u32 = 0u; b < U.dim; b = b + 1u) {
      let idx = stateIdx(t, b);
      let idxPair = stateIdx(t, b ^ flipMask);
      let re_b = state[idx];          let im_b = state[idx + 1u];
      let re_p = state[idxPair];      let im_p = state[idxPair + 1u];
      let signBit = popcount32(b & signMask) & 1u;
      var sign: f32 = 1.0;
      if (signBit != 0u) { sign = -1.0; }
      let cRe = sign * iPowRe;
      let cIm = sign * iPowIm;
      let A = re_b * cRe + im_b * cIm;
      let B = re_b * cIm - im_b * cRe;
      pe = pe + A * re_p - B * im_p;
    }
    pauliExp[k * U.T + t] = pe;
  }
}
`;

  const module = device.createShaderModule({ code: wgsl });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuf } },
      { binding: 1, resource: { buffer: opsBuf } },
      { binding: 2, resource: { buffer: rngBuf } },
      { binding: 3, resource: { buffer: probsBuf } },
      { binding: 4, resource: { buffer: uniformBuf } },
      { binding: 5, resource: { buffer: blochBuf } },
      { binding: 6, resource: { buffer: pauliExpBuf } },
      { binding: 7, resource: { buffer: termsBuf } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(T / WG_SIZE));
  pass.end();

  // Read back probs.
  const readBuf = device.createBuffer({
    size: T * dim * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(probsBuf, 0, readBuf, 0, T * dim * 4);
  // Read back Bloch vectors.
  const readBlochBuf = device.createBuffer({
    size: blochBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(blochBuf, 0, readBlochBuf, 0, blochBytes);
  // Pauli expectation read-back: K * T floats (or the 1-slot stub for K=0).
  const readPauliBuf = device.createBuffer({
    size: pauliBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(pauliExpBuf, 0, readPauliBuf, 0, pauliBytes);
  device.queue.submit([encoder.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  const raw = new Float32Array(readBuf.getMappedRange()).slice();
  readBuf.unmap();
  await readBlochBuf.mapAsync(GPUMapMode.READ);
  const rawBloch = new Float32Array(readBlochBuf.getMappedRange()).slice();
  readBlochBuf.unmap();
  await readPauliBuf.mapAsync(GPUMapMode.READ);
  const rawPauli = new Float32Array(readPauliBuf.getMappedRange()).slice();
  readPauliBuf.unmap();

  // Average across trajectories.
  const probs = new Array<number>(dim).fill(0);
  for (let t = 0; t < T; t++) {
    for (let b = 0; b < dim; b++) {
      probs[b] += raw[t * dim + b];
    }
  }
  for (let b = 0; b < dim; b++) probs[b] /= T;

  // Average Bloch vectors per qubit.
  const blochVectors: GPUBlochVector[] = [];
  for (let q = 0; q < n; q++) {
    let sx = 0, sy = 0, sz = 0;
    for (let t = 0; t < T; t++) {
      const off = (t * n + q) * 4;
      sx += rawBloch[off];
      sy += rawBloch[off + 1];
      sz += rawBloch[off + 2];
    }
    blochVectors.push({ x: sx / T, y: sy / T, z: sz / T });
  }

  // Average Pauli expectations per term if requested.
  let pauliExpectations: number[] | undefined;
  if (numPaulis > 0) {
    pauliExpectations = new Array<number>(numPaulis).fill(0);
    for (let k = 0; k < numPaulis; k++) {
      let s = 0;
      const base = k * T;
      for (let t = 0; t < T; t++) s += rawPauli[base + t];
      pauliExpectations[k] = s / T;
    }
  }

  // Cleanup
  stateBuf.destroy();
  opsBuf.destroy();
  rngBuf.destroy();
  probsBuf.destroy();
  blochBuf.destroy();
  pauliExpBuf.destroy();
  termsBuf.destroy();
  uniformBuf.destroy();
  readBuf.destroy();
  readBlochBuf.destroy();
  readPauliBuf.destroy();

  return { probabilities: probs, trajectories: T, blochVectors, pauliExpectations };
}

// ─── Expression cache (mirrors simulate.ts) ─────────────────────────────

const EXPR_CACHE = new Map<string, ReturnType<typeof compileExpr>>();
function evalParam(src: string, scope: ParameterValues): number {
  let compiled = EXPR_CACHE.get(src);
  if (!compiled) {
    compiled = compileExpr(src);
    EXPR_CACHE.set(src, compiled);
  }
  return compiled.eval(scope);
}
