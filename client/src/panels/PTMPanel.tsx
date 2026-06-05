import { useMemo } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { pauliTransferMatrix } from "../sim/ptm";
import { useEndianness, reversePauliIndex } from "./endianness";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";

type Props = {
  circuit: Circuit;
  customGates: CustomGate[];
  paramValues: ParameterValues;
};

const MAX_QUBITS = 3;
const NON_UNITARY = new Set(["measure", "measure_x", "measure_y", "reset"]);

/**
 * Pauli transfer matrix R_{ij} = (1/2ⁿ)Tr(P_i U P_j U†): how the circuit's
 * unitary maps each input Pauli (columns) to output Paulis (rows), as a
 * diverging heatmap with entries in [−1, 1]. A Clifford gate is a signed
 * permutation (one ±1 per row/column); a T gate rotates within the X–Y
 * block; the (I,I) corner is always 1. The Pauli-basis sibling of the
 * unitary heatmap and the χ-matrix. Capped at 3 qubits (64×64),
 * default-collapsed.
 */
export function PTMPanel(props: Props) {
  return (
    <PanelShell id="ptm" title="Pauli transfer matrix" defaultCollapsed>
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
    if (collapsed || n < 1 || n > MAX_QUBITS) return null;
    const r = pauliTransferMatrix(circuit, paramValues, customGates, MAX_QUBITS);
    if (!r || endian === "big") return r;
    // Little-endian: permute the Pauli axes by per-qubit reversal (canonical
    // labels stay; the data moves) so the Pauli strings read q0 on the right.
    const m = r.R.length;
    const R2 = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => r.R[reversePauliIndex(i, n)][reversePauliIndex(j, n)]));
    return { ...r, R: R2 };
  }, [collapsed, n, circuit, paramValues, customGates, endian]);

  if (n === 0) return <div className="panel__placeholder">place some gates to see the Pauli action</div>;
  if (n > MAX_QUBITS) {
    return <div className="panel__notice">{n} qubits — the PTM is capped at {MAX_QUBITS} (64×64).</div>;
  }
  if (!result) return null;

  return (
    <div className="ptm">
      {hasNonUnitary && (
        <div className="ptm__note">circuit has measurement / reset — the PTM below is of the unitary part only.</div>
      )}
      <Heatmap R={result.R} labels={result.labels} n={n} />
      <div className="ptm__legend">
        <span><span className="ptm__swatch" style={{ background: "var(--accent-2)" }} /> +1</span>
        <span><span className="ptm__swatch ptm__swatch--zero" /> 0</span>
        <span><span className="ptm__swatch" style={{ background: "#ff7a5a" }} /> −1</span>
      </div>
    </div>
  );
}

const MAX_PX = 256;

function Heatmap({ R, labels, n }: { R: number[][]; labels: string[]; n: number }) {
  const size = R.length;
  const cell = Math.max(3, Math.min(22, Math.floor(MAX_PX / size)));
  const showLabels = n <= 2;
  const pad = showLabels ? 26 : 2;
  const W = pad + size * cell;
  const H = pad + size * cell;

  return (
    <svg width={W} height={H} className="ptm__svg" role="img">
      <rect x={pad} y={pad} width={size * cell} height={size * cell} className="ptm__bg" />
      {showLabels && labels.map((lab, k) => (
        <g key={`l-${k}`}>
          <text x={pad + k * cell + cell / 2} y={pad - 6} textAnchor="middle" className="ptm__axis">{lab}</text>
          <text x={pad - 5} y={pad + k * cell + cell / 2 + 3} textAnchor="end" className="ptm__axis">{lab}</text>
        </g>
      ))}
      {R.map((row, i) =>
        row.map((v, j) => {
          if (Math.abs(v) < 1e-6) return null;
          return (
            <rect
              key={`${i}-${j}`}
              x={pad + j * cell}
              y={pad + i * cell}
              width={cell}
              height={cell}
              fill={v >= 0 ? "var(--accent-2)" : "#ff7a5a"}
              fillOpacity={Math.min(1, Math.abs(v))}
            >
              <title>R[{labels[i]} ← {labels[j]}] = {v.toFixed(3)}</title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}
