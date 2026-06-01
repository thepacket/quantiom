import type { Matrix } from "./matrices";

/**
 * Apply a k-qubit unitary U to the state in-place.
 *
 * State layout: Float64Array of length 2 * 2^n, with re/im interleaved.
 * State[2*i] is the real part of amplitude i; state[2*i+1] is the imaginary.
 *
 * Big-endian basis convention: qubit 0 is the MSB. The matrix U is indexed
 * by basis states where qubits[0] supplies the most-significant bit of the
 * sub-index, qubits[k-1] the least.
 *
 * For each fixed assignment of the n − k "other" qubits, this routine
 * extracts the 2^k-dim subspace, multiplies by U, and writes back. Total
 * cost is O(2^k · 2^n) = O(d · 2^n).
 */
export function applyKQubit(
  state: Float64Array,
  n: number,
  qubits: number[],
  U: Matrix,
): void {
  const k = qubits.length;
  const d = 1 << k;
  if (U.length !== d) {
    throw new Error(`gate matrix size ${U.length} does not match ${k} qubits`);
  }

  // Bit masks for gate qubits (big-endian: qubit q is bit (n-1-q) of the index).
  const gateMasks = qubits.map((q) => 1 << (n - 1 - q));

  // List of "other" qubit bit positions, in MSB-first order.
  const otherMasks: number[] = [];
  for (let q = 0; q < n; q++) {
    if (!qubits.includes(q)) otherMasks.push(1 << (n - 1 - q));
  }
  const otherCount = 1 << otherMasks.length;

  // Working buffers — reused across "other_val" iterations.
  const subRe = new Float64Array(d);
  const subIm = new Float64Array(d);

  // Iterate every combination of "other" bits.
  const totalOtherIters = otherMasks.length === 0 ? 1 : otherCount;
  for (let otherVal = 0; otherVal < totalOtherIters; otherVal++) {
    // Pre-compute the full-state indices for each sub_idx in this iteration.
    // (otherVal bits are constant; only the gate-qubit bits vary.)
    let otherBits = 0;
    for (let j = 0; j < otherMasks.length; j++) {
      const bit = (otherVal >> (otherMasks.length - 1 - j)) & 1;
      if (bit) otherBits |= otherMasks[j];
    }

    // Read the d amplitudes that live in this subspace.
    for (let s = 0; s < d; s++) {
      let full = otherBits;
      for (let j = 0; j < k; j++) {
        const bit = (s >> (k - 1 - j)) & 1;
        if (bit) full |= gateMasks[j];
      }
      subRe[s] = state[2 * full];
      subIm[s] = state[2 * full + 1];
    }

    // Multiply U · sub, then write back.
    for (let i = 0; i < d; i++) {
      let outRe = 0;
      let outIm = 0;
      const row = U[i];
      for (let j = 0; j < d; j++) {
        const u = row[j];
        const sr = subRe[j];
        const si = subIm[j];
        outRe += u[0] * sr - u[1] * si;
        outIm += u[0] * si + u[1] * sr;
      }
      let full = otherBits;
      for (let j = 0; j < k; j++) {
        const bit = (i >> (k - 1 - j)) & 1;
        if (bit) full |= gateMasks[j];
      }
      state[2 * full] = outRe;
      state[2 * full + 1] = outIm;
    }
  }
}
