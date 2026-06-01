import { useMemo, useState } from "react";
import type { Action } from "./state";
import { buildPlacedGate, qubitSpan } from "./state";
import type { Circuit, GateDef, PlacedGate } from "./types";
import { GATES_BY_ID, totalQubits } from "./gates";
import { DND_MIME } from "./GatePalette";

const COL_W = 56;
const ROW_H = 44;
const LABEL_W = 56;
const MIN_COLS = 16;

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<Action>;
  selectedGateId: string | null;
  onSelect: (id: string | null) => void;
};

export function CircuitCanvas({ circuit, dispatch, selectedGateId, onSelect }: Props) {
  const [hover, setHover] = useState<{ col: number; row: number; gateId: string } | null>(null);

  const usedCols = circuit.gates.reduce((m, g) => Math.max(m, g.column + 1), 0);
  const numCols = Math.max(MIN_COLS, usedCols + 4);
  const totalRows = circuit.numQubits + (circuit.numClbits > 0 ? 1 : 0); // single clbit bus row
  const width = LABEL_W + numCols * COL_W;
  const height = totalRows * ROW_H + 16;

  const onCellDragOver = (e: React.DragEvent, col: number, row: number) => {
    if (!e.dataTransfer.types.includes(DND_MIME) && !e.dataTransfer.types.includes("text/plain")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const gateId =
      (e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain") || "").toLowerCase();
    if (gateId && (!hover || hover.col !== col || hover.row !== row || hover.gateId !== gateId)) {
      setHover({ col, row, gateId });
    }
  };

  const onCellDrop = (e: React.DragEvent, col: number, row: number) => {
    e.preventDefault();
    const gateId = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
    if (!gateId) return;
    const def = GATES_BY_ID[gateId];
    if (!def) return;
    const need = totalQubits(def);
    const qubits = defaultQubitsFromDrop(row, need, circuit.numQubits);
    if (qubits.length !== need) return;
    const clbits =
      def.numClbits > 0 ? Array.from({ length: def.numClbits }, (_, i) => i % Math.max(1, circuit.numClbits)) : [];
    const placed = buildPlacedGate(gateId, col, qubits, clbits);
    dispatch({ type: "place-gate", gate: placed });
    setHover(null);
  };

  const onCellDragLeave = () => setHover(null);

  return (
    <div className="canvas">
      <svg
        className="canvas__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {/* qubit wire labels and lines */}
        {Array.from({ length: circuit.numQubits }, (_, q) => {
          const y = rowY(q);
          return (
            <g key={`wire-${q}`}>
              <text x={LABEL_W - 12} y={y + 4} className="canvas__label" textAnchor="end">
                q{q}
              </text>
              <line x1={LABEL_W} y1={y} x2={width - 4} y2={y} className="canvas__wire" />
            </g>
          );
        })}
        {/* classical bus */}
        {circuit.numClbits > 0 && (
          <g>
            <text
              x={LABEL_W - 12}
              y={rowY(circuit.numQubits) + 4}
              className="canvas__label canvas__label--cl"
              textAnchor="end"
            >
              c[{circuit.numClbits}]
            </text>
            <line
              x1={LABEL_W}
              y1={rowY(circuit.numQubits) - 2}
              x2={width - 4}
              y2={rowY(circuit.numQubits) - 2}
              className="canvas__wire canvas__wire--cl"
            />
            <line
              x1={LABEL_W}
              y1={rowY(circuit.numQubits) + 2}
              x2={width - 4}
              y2={rowY(circuit.numQubits) + 2}
              className="canvas__wire canvas__wire--cl"
            />
          </g>
        )}

        {/* drop hover preview */}
        {hover && <DropPreview hover={hover} circuit={circuit} />}

        {/* placed gates */}
        {circuit.gates.map((g) => (
          <PlacedGateView
            key={g.id}
            gate={g}
            selected={g.id === selectedGateId}
            onClick={() => onSelect(g.id)}
          />
        ))}
      </svg>

      {/* DOM drop zones overlaid on top (HTML DnD doesn't work on SVG reliably) */}
      <div className="canvas__cells" style={{ width, height }}>
        {Array.from({ length: circuit.numQubits }, (_, row) =>
          Array.from({ length: numCols }, (_, col) => (
            <div
              key={`cell-${row}-${col}`}
              className="canvas__cell"
              style={{
                left: LABEL_W + col * COL_W,
                top: row * ROW_H,
                width: COL_W,
                height: ROW_H,
              }}
              onDragOver={(e) => onCellDragOver(e, col, row)}
              onDragLeave={onCellDragLeave}
              onDrop={(e) => onCellDrop(e, col, row)}
            />
          )),
        )}
      </div>
    </div>
  );
}

function rowY(row: number) {
  return row * ROW_H + ROW_H / 2;
}

function colX(col: number) {
  return LABEL_W + col * COL_W + COL_W / 2;
}

function defaultQubitsFromDrop(dropRow: number, need: number, numQubits: number): number[] {
  // place starting at the drop row; if not enough room below, back up so all fit
  let start = dropRow;
  if (start + need > numQubits) start = Math.max(0, numQubits - need);
  return Array.from({ length: need }, (_, i) => start + i);
}

function DropPreview({
  hover,
  circuit,
}: {
  hover: { col: number; row: number; gateId: string };
  circuit: Circuit;
}) {
  const def = GATES_BY_ID[hover.gateId];
  if (!def) return null;
  const need = totalQubits(def);
  const qubits = defaultQubitsFromDrop(hover.row, need, circuit.numQubits);
  if (qubits.length !== need) return null;
  const lo = Math.min(...qubits);
  const hi = Math.max(...qubits);
  return (
    <rect
      x={LABEL_W + hover.col * COL_W + 4}
      y={lo * ROW_H + 4}
      width={COL_W - 8}
      height={(hi - lo + 1) * ROW_H - 8}
      className="canvas__drop-preview"
      rx={6}
    />
  );
}

function PlacedGateView({
  gate,
  selected,
  onClick,
}: {
  gate: PlacedGate;
  selected: boolean;
  onClick: () => void;
}) {
  const def = GATES_BY_ID[gate.gateId];
  const x = colX(gate.column);
  const all = [...gate.controls, ...gate.targets];
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);

  return (
    <g
      className={"gate" + (selected ? " gate--selected" : "")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* vertical connector for multi-qubit gates */}
      {lo !== hi && (
        <line x1={x} y1={rowY(lo)} x2={x} y2={rowY(hi)} className="gate__connector" />
      )}
      {/* controls */}
      {gate.controls.map((q) => (
        <circle key={`ctrl-${q}`} cx={x} cy={rowY(q)} r={5} className="gate__control" />
      ))}
      {/* targets */}
      {gate.targets.map((q, i) => (
        <TargetGlyph key={`tgt-${q}-${i}`} def={def} gate={gate} x={x} y={rowY(q)} />
      ))}
      {/* classical bit links for measurement */}
      {def.numClbits > 0 && gate.clbits.length > 0 && (
        <line
          x1={x}
          y1={rowY(Math.max(...gate.targets))}
          x2={x}
          y2={rowY(qubitSpan(gate).length === 0 ? 0 : Math.max(...gate.targets) + 0) + 20}
          className="gate__cl-link"
        />
      )}
    </g>
  );
}

function TargetGlyph({
  def,
  gate,
  x,
  y,
}: {
  def: GateDef;
  gate: PlacedGate;
  x: number;
  y: number;
}) {
  const label = useMemo(() => {
    if (gate.params.length === 0) return def.symbol;
    return `${def.symbol}(${gate.params.join(",")})`;
  }, [def, gate.params]);

  switch (def.targetGlyph) {
    case "x-target":
      return (
        <g>
          <circle cx={x} cy={y} r={12} className="gate__box gate__box--target" />
          <line x1={x - 12} y1={y} x2={x + 12} y2={y} className="gate__cross" />
          <line x1={x} y1={y - 12} x2={x} y2={y + 12} className="gate__cross" />
        </g>
      );
    case "swap":
      return (
        <g>
          <line x1={x - 8} y1={y - 8} x2={x + 8} y2={y + 8} className="gate__cross" />
          <line x1={x - 8} y1={y + 8} x2={x + 8} y2={y - 8} className="gate__cross" />
        </g>
      );
    case "measure":
      return (
        <g>
          <rect x={x - 16} y={y - 14} width={32} height={28} rx={4} className="gate__box gate__box--measure" />
          <path d={`M${x - 8},${y + 4} A8,8 0 0 1 ${x + 8},${y + 4}`} className="gate__meter" />
          <line x1={x} y1={y + 4} x2={x + 6} y2={y - 8} className="gate__meter" />
        </g>
      );
    case "reset":
      return (
        <g>
          <rect x={x - 14} y={y - 12} width={28} height={24} rx={3} className="gate__box gate__box--reset" />
          <text x={x} y={y + 4} textAnchor="middle" className="gate__label">
            |0⟩
          </text>
        </g>
      );
    case "state":
      return (
        <g>
          <rect x={x - 18} y={y - 12} width={36} height={24} rx={3} className="gate__box gate__box--state" />
          <text x={x} y={y + 4} textAnchor="middle" className="gate__label">
            {def.symbol}
          </text>
        </g>
      );
    case "barrier":
      return (
        <line x1={x} y1={y - 18} x2={x} y2={y + 18} className="gate__barrier" />
      );
    case "delay":
      return (
        <g>
          <rect x={x - 18} y={y - 12} width={36} height={24} rx={3} className="gate__box gate__box--delay" />
          <text x={x} y={y + 4} textAnchor="middle" className="gate__label">
            τ
          </text>
        </g>
      );
    case "box":
    default: {
      const w = Math.max(28, label.length * 7 + 10);
      return (
        <g>
          <rect x={x - w / 2} y={y - 14} width={w} height={28} rx={4} className="gate__box" />
          <text x={x} y={y + 4} textAnchor="middle" className="gate__label">
            {label}
          </text>
        </g>
      );
    }
  }
}
