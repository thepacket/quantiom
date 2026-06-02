import { useMemo, useRef, useState } from "react";
import type { HistoryAction } from "./state";
import { buildPlacedGate, qubitSpan } from "./state";
import type { Circuit, GateDef, PlacedGate } from "./types";
import { GATES_BY_ID, totalQubits } from "./gates";
import { DND_MIME, makeDragGhost } from "./GatePalette";
import { CUSTOM_PREFIX, type CustomGate } from "./customGates";

const MOVE_MIME = "application/x-quantiom-move";
const REASSIGN_CONTROL_MIME = "application/x-quantiom-reassign-control";
const REASSIGN_TARGET_MIME = "application/x-quantiom-reassign-target";

const COL_W = 68;
const ROW_H = 56;
const LABEL_W = 60;
const MIN_COLS = 16;

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
  selectedGateId: string | null;
  onSelect: (id: string | null) => void;
  /** Step cursor column. Gates with column > currentStep are faded out;
   *  a vertical line marks where the cursor is. */
  currentStep?: number;
  /** Registry used to resolve custom-gate references for rendering. */
  customGates?: CustomGate[];
  /** Optional set of gate ids to outline as search matches. */
  highlightedIds?: Set<string>;
};

type HoverState =
  | { kind: "new"; col: number; row: number; gateId: string }
  | { kind: "move"; col: number; row: number; gateId: string; placedId: string }
  | null;

export function CircuitCanvas({ circuit, dispatch, selectedGateId, onSelect, currentStep, customGates = [], highlightedIds }: Props) {
  const [hover, setHover] = useState<HoverState>(null);
  // Tracks the in-flight move-gate drag so dragOver (which can't read payload) knows the gate.
  const dragMove = useRef<{ placedId: string; gateId: string } | null>(null);

  const usedCols = circuit.gates.reduce((m, g) => Math.max(m, g.column + 1), 0);
  const numCols = Math.max(MIN_COLS, usedCols + 4);
  const totalRows = circuit.numQubits + (circuit.numClbits > 0 ? 1 : 0); // single clbit bus row
  const width = LABEL_W + numCols * COL_W;
  const height = totalRows * ROW_H + 16;

  const onCellDragOver = (e: React.DragEvent, col: number, row: number) => {
    const types = e.dataTransfer.types;
    const isReassign = types.includes(REASSIGN_CONTROL_MIME) || types.includes(REASSIGN_TARGET_MIME);
    const isMove = types.includes(MOVE_MIME);
    const isNew = types.includes(DND_MIME) || types.includes("text/plain");
    if (!isReassign && !isMove && !isNew) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = isReassign || isMove ? "move" : "copy";
    if (isReassign) {
      // No floating preview rect for reassign — the cell hover background suffices.
      return;
    }
    if (isMove) {
      // We can't read move payload until drop; track only position.
      if (!hover || hover.kind !== "move" || hover.col !== col || hover.row !== row) {
        // dragMoveId/symbol set on dragstart in module-scope refs
        if (dragMove.current) {
          setHover({
            kind: "move",
            col,
            row,
            gateId: dragMove.current.gateId,
            placedId: dragMove.current.placedId,
          });
        }
      }
    } else {
      const gateId =
        (e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain") || "").toLowerCase();
      if (gateId && (!hover || hover.kind !== "new" || hover.col !== col || hover.row !== row || hover.gateId !== gateId)) {
        setHover({ kind: "new", col, row, gateId });
      }
    }
  };

  const onCellDrop = (e: React.DragEvent, col: number, row: number) => {
    e.preventDefault();
    const reassignCtrl = e.dataTransfer.getData(REASSIGN_CONTROL_MIME);
    if (reassignCtrl) {
      const [id, idxStr] = reassignCtrl.split(":");
      dispatch({ type: "reassign-qubit", id, role: "controls", index: parseInt(idxStr, 10), newQubit: row });
      setHover(null);
      return;
    }
    const reassignTgt = e.dataTransfer.getData(REASSIGN_TARGET_MIME);
    if (reassignTgt) {
      const [id, idxStr] = reassignTgt.split(":");
      dispatch({ type: "reassign-qubit", id, role: "targets", index: parseInt(idxStr, 10), newQubit: row });
      setHover(null);
      return;
    }
    const moveId = e.dataTransfer.getData(MOVE_MIME);
    if (moveId) {
      dispatch({ type: "move-gate", id: moveId, column: col, anchorQubit: row });
      setHover(null);
      dragMove.current = null;
      return;
    }
    const gateId = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
    if (!gateId) return;
    // Custom (user-defined) gate path.
    if (gateId.startsWith(CUSTOM_PREFIX)) {
      const customDef = customGates.find((c) => c.id === gateId.slice(CUSTOM_PREFIX.length));
      if (!customDef) return;
      const qubits = defaultQubitsFromDrop(row, customDef.numQubits, circuit.numQubits);
      if (qubits.length !== customDef.numQubits) return;
      dispatch({
        type: "place-gate",
        gate: {
          id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          gateId,
          column: col,
          controls: [],
          targets: qubits,
          clbits: [],
          params: [],
        },
      });
      setHover(null);
      return;
    }
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

  const onGateDragStart = (e: React.DragEvent<HTMLDivElement>, gate: PlacedGate) => {
    const def = GATES_BY_ID[gate.gateId];
    e.dataTransfer.setData(MOVE_MIME, gate.id);
    e.dataTransfer.effectAllowed = "move";
    dragMove.current = { placedId: gate.id, gateId: gate.gateId };
    const ghost = makeDragGhost(def.symbol);
    e.dataTransfer.setDragImage(ghost, 20, 14);
    setTimeout(() => ghost.remove(), 0);
  };

  const onGateDragEnd = () => {
    dragMove.current = null;
    setHover(null);
  };

  const onReassignDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    gate: PlacedGate,
    role: "controls" | "targets",
    index: number,
  ) => {
    const def = GATES_BY_ID[gate.gateId];
    const mime = role === "controls" ? REASSIGN_CONTROL_MIME : REASSIGN_TARGET_MIME;
    e.dataTransfer.setData(mime, `${gate.id}:${index}`);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
    const symbol = role === "controls" ? "●" : def.symbol;
    const ghost = makeDragGhost(symbol);
    e.dataTransfer.setDragImage(ghost, 12, 12);
    setTimeout(() => ghost.remove(), 0);
  };

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
          const label = circuit.qubitNames?.[q]?.trim() || `q${q}`;
          const onRename = () => {
            const next = window.prompt(`Rename qubit ${q}`, label);
            if (next === null) return;
            const trimmed = next.trim();
            const names = [...(circuit.qubitNames ?? [])];
            while (names.length < circuit.numQubits) names.push("");
            names[q] = trimmed;
            dispatch({ type: "rename-qubit", index: q, name: trimmed });
          };
          return (
            <g key={`wire-${q}`}>
              <text
                x={LABEL_W - 12}
                y={y + 4}
                className="canvas__label"
                textAnchor="end"
                onDoubleClick={onRename}
                style={{ cursor: "text" }}
              >
                <title>Double-click to rename</title>
                {label}
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
        {hover && <DropPreview hover={hover} circuit={circuit} customGates={customGates} />}

        {/* step cursor (vertical line between the executed and pending columns) */}
        {currentStep !== undefined && currentStep < numCols - 1 && (
          <line
            x1={LABEL_W + (currentStep + 1) * COL_W}
            y1={0}
            x2={LABEL_W + (currentStep + 1) * COL_W}
            y2={height}
            className="canvas__step-cursor"
          />
        )}
        {/* placed gates */}
        {circuit.gates.map((g) => (
          <PlacedGateView
            key={g.id}
            gate={g}
            selected={g.id === selectedGateId}
            onClick={() => onSelect(g.id)}
            past={currentStep !== undefined && g.column > currentStep}
            customGates={customGates}
            matched={highlightedIds?.has(g.id) ?? false}
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
        {/* Per-gate draggable overlays for move gesture. Sit above cells. */}
        {circuit.gates.map((g) => {
          const all = [...g.controls, ...g.targets];
          if (all.length === 0) return null;
          const lo = Math.min(...all);
          const hi = Math.max(...all);
          return (
            <div
              key={`move-${g.id}`}
              className="canvas__move-handle"
              style={{
                left: LABEL_W + g.column * COL_W + 6,
                top: lo * ROW_H + 4,
                width: COL_W - 12,
                height: (hi - lo + 1) * ROW_H - 8,
              }}
              draggable
              onDragStart={(e) => onGateDragStart(e, g)}
              onDragEnd={onGateDragEnd}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(g.id);
              }}
              title="drag to move"
            />
          );
        })}
        {/* Per-control and per-target reassign handles. Higher in DOM = on top. */}
        {circuit.gates.flatMap((g) => [
          ...g.controls.map((q, i) => ({ g, role: "controls" as const, index: i, row: q })),
          ...g.targets.map((q, i) => ({ g, role: "targets" as const, index: i, row: q })),
        ]).map(({ g, role, index, row }) => (
          <div
            key={`reassign-${g.id}-${role}-${index}`}
            className={`canvas__reassign canvas__reassign--${role}`}
            style={{
              left: LABEL_W + g.column * COL_W + (COL_W - 22) / 2,
              top: row * ROW_H + (ROW_H - 22) / 2,
              width: 22,
              height: 22,
            }}
            draggable
            onDragStart={(e) => onReassignDragStart(e, g, role, index)}
            onDragEnd={onGateDragEnd}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(g.id);
            }}
            title={`drag to reassign ${role === "controls" ? "control" : "target"}`}
          />
        ))}
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
  customGates,
}: {
  hover: NonNullable<HoverState>;
  circuit: Circuit;
  customGates: CustomGate[];
}) {
  let need: number | undefined;
  if (hover.gateId.startsWith(CUSTOM_PREFIX)) {
    const cd = customGates.find((c) => c.id === hover.gateId.slice(CUSTOM_PREFIX.length));
    need = cd?.numQubits;
  } else {
    const def = GATES_BY_ID[hover.gateId];
    need = def ? totalQubits(def) : undefined;
  }
  if (need === undefined) return null;
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
  past,
  customGates,
  matched,
}: {
  gate: PlacedGate;
  selected: boolean;
  onClick: () => void;
  past?: boolean;
  customGates: CustomGate[];
  matched?: boolean;
}) {
  const isCustom = gate.gateId.startsWith(CUSTOM_PREFIX);
  const customDef = isCustom
    ? customGates.find((c) => c.id === gate.gateId.slice(CUSTOM_PREFIX.length))
    : undefined;
  const def = isCustom ? undefined : GATES_BY_ID[gate.gateId];
  const x = colX(gate.column);
  const all = [...gate.controls, ...gate.targets];
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);

  // Custom gates render as a single coloured box spanning the qubit range.
  if (isCustom) {
    const yTop = lo * ROW_H + 8;
    const boxH = (hi - lo + 1) * ROW_H - 16;
    const label = customDef?.name ?? "?";
    const w = Math.max(40, label.length * 8 + 12);
    return (
      <g
        className={"gate gate--custom" + (selected ? " gate--selected" : "") + (past ? " gate--past" : "") + (matched ? " gate--match" : "")}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <rect x={x - w / 2} y={yTop} width={w} height={boxH} rx={6} className="gate__box gate__box--custom" />
        <text x={x} y={(lo * ROW_H + (hi + 1) * ROW_H) / 2 + 5} textAnchor="middle" className="gate__label">
          {label.slice(0, 8)}
        </text>
      </g>
    );
  }

  if (!def) return null;

  const tooltip = `${def.name} (${def.id})
qubits: ${all.join(", ")}
column ${gate.column}${gate.params.length > 0 ? `\nparams: ${gate.params.join(", ")}` : ""}${gate.condition ? `\nif c[${gate.condition.clbit}] == ${gate.condition.value}` : ""}`;
  return (
    <g
      className={"gate" + (selected ? " gate--selected" : "") + (past ? " gate--past" : "") + (matched ? " gate--match" : "")}
      data-cat={def.category}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <title>{tooltip}</title>
      {/* vertical connector for multi-qubit gates */}
      {lo !== hi && (
        <line x1={x} y1={rowY(lo)} x2={x} y2={rowY(hi)} className="gate__connector" />
      )}
      {/* controls */}
      {gate.controls.map((q, i) => {
        const isAnti = gate.controlStates?.[i] === false;
        return (
          <circle
            key={`ctrl-${q}-${i}`}
            cx={x}
            cy={rowY(q)}
            r={6}
            className={isAnti ? "gate__control gate__control--anti" : "gate__control"}
          />
        );
      })}
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
      {gate.annotation && (
        <text
          x={x}
          y={hi * ROW_H + ROW_H - 4}
          textAnchor="middle"
          className="gate__annotation"
        >
          <title>{gate.annotation}</title>
          {gate.annotation.length > 10 ? gate.annotation.slice(0, 9) + "…" : gate.annotation}
        </text>
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
          <circle cx={x} cy={y} r={15} className="gate__box gate__box--target" />
          <line x1={x - 15} y1={y} x2={x + 15} y2={y} className="gate__cross" />
          <line x1={x} y1={y - 15} x2={x} y2={y + 15} className="gate__cross" />
        </g>
      );
    case "swap":
      return (
        <g>
          <line x1={x - 11} y1={y - 11} x2={x + 11} y2={y + 11} className="gate__cross" />
          <line x1={x - 11} y1={y + 11} x2={x + 11} y2={y - 11} className="gate__cross" />
        </g>
      );
    case "measure":
      return (
        <g>
          <rect x={x - 20} y={y - 18} width={40} height={36} rx={4} className="gate__box gate__box--measure" />
          <path d={`M${x - 10},${y + 5} A10,10 0 0 1 ${x + 10},${y + 5}`} className="gate__meter" />
          <line x1={x} y1={y + 5} x2={x + 8} y2={y - 10} className="gate__meter" />
        </g>
      );
    case "reset":
      return (
        <g>
          <rect x={x - 18} y={y - 16} width={36} height={32} rx={4} className="gate__box gate__box--reset" />
          <text x={x} y={y + 5} textAnchor="middle" className="gate__label">
            |0⟩
          </text>
        </g>
      );
    case "state":
      return (
        <g>
          <rect x={x - 22} y={y - 16} width={44} height={32} rx={4} className="gate__box gate__box--state" />
          <text x={x} y={y + 5} textAnchor="middle" className="gate__label">
            {def.symbol}
          </text>
        </g>
      );
    case "barrier":
      return (
        <line x1={x} y1={y - 22} x2={x} y2={y + 22} className="gate__barrier" />
      );
    case "delay":
      return (
        <g>
          <rect x={x - 22} y={y - 16} width={44} height={32} rx={4} className="gate__box gate__box--delay" />
          <text x={x} y={y + 5} textAnchor="middle" className="gate__label">
            τ
          </text>
        </g>
      );
    case "box":
    default: {
      const w = Math.max(36, label.length * 8 + 12);
      return (
        <g>
          <rect x={x - w / 2} y={y - 18} width={w} height={36} rx={5} className="gate__box" />
          <text x={x} y={y + 5} textAnchor="middle" className="gate__label">
            {label}
          </text>
        </g>
      );
    }
  }
}
