import { c, cmul, expi, type Complex, ONE, ZERO, I as IMAG_I } from "./complex";

export type Matrix = readonly Complex[][];

// ─── Single-qubit fixed ─────────────────────────────────────────────────
const SQRT1_2 = Math.SQRT1_2;

export const M_I: Matrix = [
  [ONE, ZERO],
  [ZERO, ONE],
];

export const M_X: Matrix = [
  [ZERO, ONE],
  [ONE, ZERO],
];

export const M_Y: Matrix = [
  [ZERO, c(0, -1)],
  [c(0, 1), ZERO],
];

export const M_Z: Matrix = [
  [ONE, ZERO],
  [ZERO, c(-1)],
];

export const M_H: Matrix = [
  [c(SQRT1_2), c(SQRT1_2)],
  [c(SQRT1_2), c(-SQRT1_2)],
];

export const M_S: Matrix = [
  [ONE, ZERO],
  [ZERO, IMAG_I],
];

export const M_Sdg: Matrix = [
  [ONE, ZERO],
  [ZERO, c(0, -1)],
];

export const M_SX: Matrix = [
  [c(0.5, 0.5), c(0.5, -0.5)],
  [c(0.5, -0.5), c(0.5, 0.5)],
];

export const M_SXdg: Matrix = [
  [c(0.5, -0.5), c(0.5, 0.5)],
  [c(0.5, 0.5), c(0.5, -0.5)],
];

// √Y and its inverse (Clifford). √Y = e^{iπ/4}·RY(π/2); squares to Y.
export const M_SY: Matrix = [
  [c(0.5, 0.5), c(-0.5, -0.5)],
  [c(0.5, 0.5), c(0.5, 0.5)],
];

export const M_SYdg: Matrix = [
  [c(0.5, -0.5), c(0.5, -0.5)],
  [c(-0.5, 0.5), c(0.5, -0.5)],
];

export const M_T: Matrix = [
  [ONE, ZERO],
  [ZERO, expi(Math.PI / 4)],
];

export const M_Tdg: Matrix = [
  [ONE, ZERO],
  [ZERO, expi(-Math.PI / 4)],
];

// ─── Single-qubit parameterized ─────────────────────────────────────────
export const M_P = (lambda: number): Matrix => [
  [ONE, ZERO],
  [ZERO, expi(lambda)],
];

export const M_RX = (theta: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  return [
    [c(co), c(0, -si)],
    [c(0, -si), c(co)],
  ];
};

export const M_RY = (theta: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  return [
    [c(co), c(-si)],
    [c(si), c(co)],
  ];
};

export const M_RZ = (theta: number): Matrix => [
  [expi(-theta / 2), ZERO],
  [ZERO, expi(theta / 2)],
];

// IonQ native single-qubit gates.
// GPi(φ) = [[0, e^{−iφ}], [e^{iφ}, 0]] — a phased bit-flip (Hermitian ⇒
// self-inverse). GPi(0) = X.
export const M_GPI = (phi: number): Matrix => [
  [ZERO, c(Math.cos(phi), -Math.sin(phi))],
  [c(Math.cos(phi), Math.sin(phi)), ZERO],
];

// GPi2(φ) = (1/√2)[[1, −i e^{−iφ}], [−i e^{iφ}, 1]] = R(π/2, φ).
export const M_GPI2 = (phi: number): Matrix => {
  const r = SQRT1_2;
  const sp = Math.sin(phi), cp = Math.cos(phi);
  return [
    [c(r, 0), c(-r * sp, -r * cp)],
    [c(r * sp, -r * cp), c(r, 0)],
  ];
};

// R(θ,φ) — rotation by θ about the equatorial axis at angle φ:
// exp(−iθ/2 (cosφ·X + sinφ·Y)). R(θ,0)=RX(θ), R(θ,π/2)=RY(θ).
export const M_R = (theta: number, phi: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  return [
    [c(co), c(-si * sp, -si * cp)],
    [c(si * sp, -si * cp), c(co)],
  ];
};

export const M_U = (theta: number, phi: number, lam: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  return [
    [c(co), cmul(expi(lam), c(-si))],
    [cmul(expi(phi), c(si)), cmul(expi(phi + lam), c(co))],
  ];
};

export const M_U1 = (lambda: number): Matrix => M_P(lambda);

export const M_U2 = (phi: number, lam: number): Matrix => [
  [c(SQRT1_2), cmul(expi(lam), c(-SQRT1_2))],
  [cmul(expi(phi), c(SQRT1_2)), cmul(expi(phi + lam), c(SQRT1_2))],
];

export const M_U3 = M_U;

// ─── Two-qubit fixed ────────────────────────────────────────────────────
export const M_SWAP: Matrix = [
  [ONE, ZERO, ZERO, ZERO],
  [ZERO, ZERO, ONE, ZERO],
  [ZERO, ONE, ZERO, ZERO],
  [ZERO, ZERO, ZERO, ONE],
];

export const M_iSWAP: Matrix = [
  [ONE, ZERO, ZERO, ZERO],
  [ZERO, ZERO, IMAG_I, ZERO],
  [ZERO, IMAG_I, ZERO, ZERO],
  [ZERO, ZERO, ZERO, ONE],
];

export const M_DCX: Matrix = [
  [ONE, ZERO, ZERO, ZERO],
  [ZERO, ZERO, ZERO, ONE],
  [ZERO, ONE, ZERO, ZERO],
  [ZERO, ZERO, ONE, ZERO],
];

// √SWAP — partial-swap entangler; squares to SWAP. Not Clifford.
export const M_SQRTSWAP: Matrix = [
  [ONE, ZERO, ZERO, ZERO],
  [ZERO, c(0.5, 0.5), c(0.5, -0.5), ZERO],
  [ZERO, c(0.5, -0.5), c(0.5, 0.5), ZERO],
  [ZERO, ZERO, ZERO, ONE],
];

export const M_SQRTSWAPdg: Matrix = [
  [ONE, ZERO, ZERO, ZERO],
  [ZERO, c(0.5, -0.5), c(0.5, 0.5), ZERO],
  [ZERO, c(0.5, 0.5), c(0.5, -0.5), ZERO],
  [ZERO, ZERO, ZERO, ONE],
];

export const M_ECR: Matrix = (() => {
  const s = SQRT1_2;
  return [
    [ZERO, c(s), ZERO, c(0, s)],
    [c(s), ZERO, c(0, -s), ZERO],
    [ZERO, c(0, s), ZERO, c(s)],
    [c(0, -s), ZERO, c(s), ZERO],
  ];
})();

// ─── Two-qubit parameterized (Ising / native) ───────────────────────────
export const M_RXX = (theta: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  const isi = c(0, -si);
  const coC = c(co);
  return [
    [coC, ZERO, ZERO, isi],
    [ZERO, coC, isi, ZERO],
    [ZERO, isi, coC, ZERO],
    [isi, ZERO, ZERO, coC],
  ];
};

export const M_RYY = (theta: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  const isi = c(0, si);
  const inegSi = c(0, -si);
  const coC = c(co);
  return [
    [coC, ZERO, ZERO, isi],
    [ZERO, coC, inegSi, ZERO],
    [ZERO, inegSi, coC, ZERO],
    [isi, ZERO, ZERO, coC],
  ];
};

export const M_RZZ = (theta: number): Matrix => {
  const em = expi(-theta / 2);
  const ep = expi(theta / 2);
  return [
    [em, ZERO, ZERO, ZERO],
    [ZERO, ep, ZERO, ZERO],
    [ZERO, ZERO, ep, ZERO],
    [ZERO, ZERO, ZERO, em],
  ];
};

export const M_RZX = (theta: number): Matrix => {
  const co = Math.cos(theta / 2);
  const si = Math.sin(theta / 2);
  const coC = c(co);
  const inegSi = c(0, -si);
  const isi = c(0, si);
  return [
    [coC, inegSi, ZERO, ZERO],
    [inegSi, coC, ZERO, ZERO],
    [ZERO, ZERO, coC, isi],
    [ZERO, ZERO, isi, coC],
  ];
};

// fSim(θ,φ) — Google's native two-qubit gate: an iSWAP-like XY rotation by
// θ plus a controlled-phase φ on |11⟩. Generalises iSWAP (θ=−π/2, φ=0) and
// CZ (θ=0, φ=π).
export const M_FSIM = (theta: number, phi: number): Matrix => {
  const co = c(Math.cos(theta));
  const isi = c(0, -Math.sin(theta));
  return [
    [ONE, ZERO, ZERO, ZERO],
    [ZERO, co, isi, ZERO],
    [ZERO, isi, co, ZERO],
    [ZERO, ZERO, ZERO, expi(-phi)],
  ];
};

// Mølmer–Sørensen MS(φ₀,φ₁,θ) = exp(−iθ/2 · GPi(φ₀)⊗GPi(φ₁)) — IonQ's
// native two-qubit entangler. MS(0,0,π/2) = RXX(π/2). Generalises RXX with
// per-qubit drive phases.
export const M_MS = (p0: number, p1: number, theta: number): Matrix => {
  const cc = Math.cos(theta / 2);
  const ss = Math.sin(theta / 2);
  const sum = p0 + p1, dif = p0 - p1;
  const cc0 = c(cc, 0);
  return [
    [cc0, ZERO, ZERO, c(-ss * Math.sin(sum), -ss * Math.cos(sum))],
    [ZERO, cc0, c(-ss * Math.sin(dif), -ss * Math.cos(dif)), ZERO],
    [ZERO, c(ss * Math.sin(dif), -ss * Math.cos(dif)), cc0, ZERO],
    [c(ss * Math.sin(sum), -ss * Math.cos(sum)), ZERO, ZERO, cc0],
  ];
};

export const M_XX_PLUS_YY = (theta: number, beta: number): Matrix => {
  const co = c(Math.cos(theta / 2));
  const si = Math.sin(theta / 2);
  const e_neg_beta = expi(-beta);
  const e_pos_beta = expi(beta);
  const a01 = cmul(c(0, -si), e_neg_beta);
  const a10 = cmul(c(0, -si), e_pos_beta);
  return [
    [ONE, ZERO, ZERO, ZERO],
    [ZERO, co, a01, ZERO],
    [ZERO, a10, co, ZERO],
    [ZERO, ZERO, ZERO, ONE],
  ];
};

export const M_XX_MINUS_YY = (theta: number, beta: number): Matrix => {
  const co = c(Math.cos(theta / 2));
  const si = Math.sin(theta / 2);
  const e_neg_beta = expi(-beta);
  const e_pos_beta = expi(beta);
  const a03 = cmul(c(0, -si), e_neg_beta);
  const a30 = cmul(c(0, -si), e_pos_beta);
  return [
    [co, ZERO, ZERO, a03],
    [ZERO, ONE, ZERO, ZERO],
    [ZERO, ZERO, ONE, ZERO],
    [a30, ZERO, ZERO, co],
  ];
};

// ─── Controlled wrapper ─────────────────────────────────────────────────
/** Wrap a unitary U with n control qubits placed as MSBs. */
export function controlled(U: Matrix, nCtrl = 1): Matrix {
  const d = U.length;
  const fullDim = (1 << nCtrl) * d;
  const M: Complex[][] = [];
  for (let i = 0; i < fullDim; i++) {
    const row: Complex[] = new Array(fullDim);
    for (let j = 0; j < fullDim; j++) row[j] = i === j ? ONE : ZERO;
    M.push(row);
  }
  const offset = ((1 << nCtrl) - 1) * d;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      M[offset + i][offset + j] = U[i][j];
    }
  }
  return M;
}

// ─── Resolver: gate id → matrix builder ─────────────────────────────────
/**
 * Build the unitary matrix for a gate by id. Returns null for non-unitary
 * or control-flow gates (caller skips them). For mcx/mcp/mcu the caller
 * must pass nControls.
 */
export function buildMatrix(
  gateId: string,
  params: number[],
  nControls?: number,
): Matrix | null {
  switch (gateId) {
    // Fixed single-qubit
    case "i": return M_I;
    case "x": return M_X;
    case "y": return M_Y;
    case "z": return M_Z;
    case "h": return M_H;
    case "s": return M_S;
    case "sdg": return M_Sdg;
    case "sx": return M_SX;
    case "sxdg": return M_SXdg;
    case "sy": return M_SY;
    case "sydg": return M_SYdg;
    case "t": return M_T;
    case "tdg": return M_Tdg;
    // Parameterized single-qubit
    case "p": return M_P(params[0]);
    case "rx": return M_RX(params[0]);
    case "ry": return M_RY(params[0]);
    case "rz": return M_RZ(params[0]);
    case "r": return M_R(params[0], params[1]);
    case "gpi": return M_GPI(params[0]);
    case "gpi2": return M_GPI2(params[0]);
    case "u": return M_U(params[0], params[1], params[2]);
    case "u1": return M_U1(params[0]);
    case "u2": return M_U2(params[0], params[1]);
    case "u3": return M_U3(params[0], params[1], params[2]);
    case "u_arb": return [
      [c(params[0], params[1]), c(params[2], params[3])],
      [c(params[4], params[5]), c(params[6], params[7])],
    ];
    case "u_arb_2": {
      // 32 params = Re/Im for each of 16 cells, row-major.
      const M: Complex[][] = [];
      for (let r = 0; r < 4; r++) {
        const row: Complex[] = [];
        for (let cc = 0; cc < 4; cc++) {
          const k = (r * 4 + cc) * 2;
          row.push(c(params[k] ?? 0, params[k + 1] ?? 0));
        }
        M.push(row);
      }
      return M;
    }
    // Two-qubit fixed
    case "swap": return M_SWAP;
    case "iswap": return M_iSWAP;
    case "dcx": return M_DCX;
    case "ecr": return M_ECR;
    case "sqrtswap": return M_SQRTSWAP;
    case "sqrtswapdg": return M_SQRTSWAPdg;
    // Two-qubit parameterized
    case "fsim": return M_FSIM(params[0], params[1]);
    case "ms": return M_MS(params[0], params[1], params[2]);
    case "rxx": return M_RXX(params[0]);
    case "ryy": return M_RYY(params[0]);
    case "rzz": return M_RZZ(params[0]);
    case "rzx": return M_RZX(params[0]);
    case "xx_plus_yy": return M_XX_PLUS_YY(params[0], params[1]);
    case "xx_minus_yy": return M_XX_MINUS_YY(params[0], params[1]);
    // Controlled (fixed-arity, single control)
    case "cx": return controlled(M_X);
    case "cy": return controlled(M_Y);
    case "cz": return controlled(M_Z);
    case "ch": return controlled(M_H);
    case "csx": return controlled(M_SX);
    case "csxdg": return controlled(M_SXdg);
    // Controlled with parameters
    case "crx": return controlled(M_RX(params[0]));
    case "cry": return controlled(M_RY(params[0]));
    case "crz": return controlled(M_RZ(params[0]));
    case "cp": return controlled(M_P(params[0]));
    case "cu": return controlled(M_U(params[0], params[1], params[2]));
    case "cu1": return controlled(M_U1(params[0]));
    case "cu3": return controlled(M_U3(params[0], params[1], params[2]));
    // Three-qubit / multi-controlled (fixed counts)
    case "ccx": return controlled(M_X, 2);
    case "ccz": return controlled(M_Z, 2);
    case "cswap": return controlled(M_SWAP, 1);
    case "rccx": return controlled(M_X, 2);   // simplified — relative phase ignored
    case "rcccx": return controlled(M_X, 3);
    case "c3x": return controlled(M_X, 3);
    case "c4x": return controlled(M_X, 4);
    // Variable-arity multi-controlled
    case "mcx": return controlled(M_X, nControls ?? 1);
    case "mcp": return controlled(M_P(params[0]), nControls ?? 1);
    case "mcu": return controlled(M_U(params[0], params[1], params[2]), nControls ?? 1);
    default: return null;
  }
}
