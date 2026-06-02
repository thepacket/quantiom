// Quick sanity test for kak.ts. Not part of the production build —
// run with `npx tsx scripts/test-kak.ts` from the client/ directory.
//
// We don't ship a test framework; this is a one-off verification script.

import type { Complex } from "../src/sim/complex";
import { decomposeKAK4x4 } from "../src/sim/kak";

const I_C: Complex = [1, 0];
const Z_C: Complex = [0, 0];

function eye4(): Complex[][] {
  const out: Complex[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => Z_C),
  );
  for (let i = 0; i < 4; i++) out[i][i] = I_C;
  return out;
}

// CNOT (control = qubit 0, target = qubit 1) in big-endian basis order.
function cnot(): Complex[][] {
  const m = eye4();
  // swap rows 2 and 3 (|10⟩ ↔ |11⟩)
  [m[2], m[3]] = [m[3], m[2]];
  return m;
}

// SWAP
function swap(): Complex[][] {
  const m = eye4();
  [m[1], m[2]] = [m[2], m[1]];
  return m;
}

// iSWAP-like: e^{iθ XX} for testing the rxx-only interaction.
function expIxx(theta: number): Complex[][] {
  // exp(iθ XX) = cos(θ)·I⊗I + i sin(θ)·X⊗X
  const c = Math.cos(theta), s = Math.sin(theta);
  const m: Complex[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => Z_C),
  );
  // Diagonal: cos(θ)
  for (let i = 0; i < 4; i++) m[i][i] = [c, 0];
  // X⊗X maps |00⟩↔|11⟩, |01⟩↔|10⟩
  m[0][3] = [0, s];
  m[3][0] = [0, s];
  m[1][2] = [0, s];
  m[2][1] = [0, s];
  return m;
}

// Random 4x4 unitary — sample from Haar (rough): start from identity,
// apply random unitary perturbations. We use a fixed seed for reproducibility.
function randomUnitary(seed: number): Complex[][] {
  // Mulberry32 PRNG
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Generate a complex Gaussian 4×4 matrix and QR-decompose for unitary.
  const re: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  const im: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      // Box-Muller
      const u1 = Math.max(1e-12, rand());
      const u2 = rand();
      re[i][j] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      im[i][j] = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    }
  }
  // Modified Gram-Schmidt on the complex columns.
  for (let k = 0; k < 4; k++) {
    // Normalise column k.
    let nrm = 0;
    for (let i = 0; i < 4; i++) nrm += re[i][k] * re[i][k] + im[i][k] * im[i][k];
    nrm = Math.sqrt(nrm);
    for (let i = 0; i < 4; i++) { re[i][k] /= nrm; im[i][k] /= nrm; }
    // Orthogonalise later columns against k.
    for (let j = k + 1; j < 4; j++) {
      // <col_k | col_j> in complex inner product = Σ conj(col_k[i]) · col_j[i]
      let dotRe = 0, dotIm = 0;
      for (let i = 0; i < 4; i++) {
        const a_re = re[i][k], a_im = -im[i][k]; // conj
        const b_re = re[i][j], b_im = im[i][j];
        dotRe += a_re * b_re - a_im * b_im;
        dotIm += a_re * b_im + a_im * b_re;
      }
      for (let i = 0; i < 4; i++) {
        // col_j -= dot · col_k
        const k_re = re[i][k], k_im = im[i][k];
        const sub_re = dotRe * k_re - dotIm * k_im;
        const sub_im = dotRe * k_im + dotIm * k_re;
        re[i][j] -= sub_re;
        im[i][j] -= sub_im;
      }
    }
  }
  const out: Complex[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => Z_C),
  );
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i][j] = [re[i][j], im[i][j]];
  return out;
}

// ── Run tests ─────────────────────────────────────────────────────────

function testCase(label: string, U: Complex[][]) {
  const r = decomposeKAK4x4(U);
  if (!r) {
    console.log(`FAIL  ${label}: decomposition returned null`);
    return;
  }
  const status = r.residual < 1e-4 ? "PASS" : "FAIL";
  console.log(`${status}  ${label}: residual = ${r.residual.toExponential(2)} · α=${r.interaction.alpha.toFixed(4)} β=${r.interaction.beta.toFixed(4)} γ=${r.interaction.gamma.toFixed(4)} · ${r.gates.length} gates`);
}

testCase("identity", eye4());
testCase("CNOT", cnot());
testCase("SWAP", swap());
testCase("exp(i·π/4·XX)", expIxx(Math.PI / 4));
testCase("exp(i·π/2·XX)", expIxx(Math.PI / 2));
for (let seed = 1; seed <= 5; seed++) {
  testCase(`random unitary (seed=${seed})`, randomUnitary(seed));
}
