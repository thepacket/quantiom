import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { buildUnitary } from "../sim/unitary";
import { useEndianness, reverseBits } from "./endianness";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 6;
const NON_UNITARY = new Set(["measure", "measure_x", "measure_y", "reset"]);

/**
 * Unitary heatmap. The circuit's full 2ⁿ × 2ⁿ operator in the computational
 * basis, each entry U[i,j] drawn as a cell whose brightness is |U[i,j]| and
 * whose hue is arg(U[i,j]). Built column by column (input |j⟩ → output
 * column j), the same construction the equivalence checker uses.
 *
 * Distinct from the Tomography panel's χ-matrix (the process matrix in the
 * Pauli basis): this is the operator itself. A permutation shows a single
 * lit cell per row/column; a controlled gate shows a block structure; QFT
 * shows uniform magnitude with a phase staircase. Capped at 6 qubits
 * (64×64), computed only while open (default-collapsed).
 */
export function UnitaryHeatmapPanel(props: Props) {
  return (
    <PanelShell id="unitary-heatmap" title="Unitary heatmap" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

function Body({ circuit, customGates, paramValues }: Props) {
  const collapsed = usePanelCollapsed();
  const { endian } = useEndianness();
  const n = circuit.numQubits;
  const hasNonUnitary = circuit.gates.some((g) => NON_UNITARY.has(g.gateId));

  const result = useMemo(() => {
    if (collapsed) return null;
    if (n < 1 || n > MAX_QUBITS) return null;
    const u = buildUnitary(circuit, paramValues, customGates, MAX_QUBITS);
    if (!u || endian === "big") return u;
    // Little-endian display: permute rows and columns by bit-reversal so the
    // operator is shown in Qiskit's basis ordering (display only).
    const { mag, phase, dim } = u;
    const m2 = new Float64Array(mag.length);
    const p2 = new Float64Array(phase.length);
    for (let i = 0; i < dim; i++) {
      const si = reverseBits(i, n);
      for (let j = 0; j < dim; j++) {
        const sj = reverseBits(j, n);
        m2[i * dim + j] = mag[si * dim + sj];
        p2[i * dim + j] = phase[si * dim + sj];
      }
    }
    return { mag: m2, phase: p2, dim };
  }, [collapsed, n, circuit, paramValues, customGates, endian]);

  if (n === 0) return <div className="panel__placeholder">place some gates to see the operator</div>;
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the unitary heatmap is capped at {MAX_QUBITS} (64×64).</div>;
  }
  if (!result) return null;

  return (
    <div className="unimap">
      {hasNonUnitary && (
        <div className="unimap__note">
          circuit has measurement / reset — the columns below are the per-basis output, not a true unitary.
        </div>
      )}
      <Heatmap mag={result.mag} phase={result.phase} dim={result.dim} />
      <div className="unimap__legend">
        <span>brightness = |U<sub>ij</sub>|</span>
        <span>hue = arg</span>
        <span className="ampphase__hue" />
      </div>
    </div>
  );
}

function hueFor(phase: number): string {
  const deg = ((phase + Math.PI) / (2 * Math.PI)) * 360;
  return `hsl(${deg.toFixed(0)}, 70%, 55%)`;
}

const MAX_PX = 256;

function Heatmap({ mag, phase, dim }: { mag: Float64Array; phase: Float64Array; dim: number }) {
  const cell = Math.max(3, Math.min(20, Math.floor(MAX_PX / dim)));
  const size = dim * cell;
  const cells = [];
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      const m = mag[i * dim + j];
      if (m < 1e-6) continue;
      cells.push(
        <rect
          key={`${i}-${j}`}
          x={j * cell}
          y={i * cell}
          width={cell}
          height={cell}
          fill={hueFor(phase[i * dim + j])}
          fillOpacity={Math.min(1, m)}
        >
          <title>U[{i},{j}] = {m.toFixed(3)} ∠ {(phase[i * dim + j] * 180 / Math.PI).toFixed(0)}°</title>
        </rect>,
      );
    }
  }
  return (
    <svg width={size} height={size} className="unimap__svg" role="img">
      <rect width={size} height={size} className="unimap__bg" />
      {cells}
    </svg>
  );
}
