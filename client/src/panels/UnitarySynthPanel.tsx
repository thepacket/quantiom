import { useState } from "react";
import { PanelShell, usePanelCollapsed } from "./PanelShell";
import { synthesizeUnitary, type Cx } from "../sim/unitarySynth";
import { simulate, type ParameterValues } from "../sim/simulate";
import { estimateResources } from "../sim/resources";
import type { Circuit } from "../editor/types";
import type { CustomGate } from "../editor/customGates";

type Props = { circuit: Circuit; customGates: CustomGate[]; paramValues: ParameterValues; onLoadInNewTab: (circuit: Circuit, name?: string) => void };

const MAX_QUBITS = 4;

/**
 * Unitary synthesis. Takes the current circuit's full unitary and re-synthesizes
 * it into an equivalent circuit of controlled `u_arb` two-level gates (Gray-
 * ordered Givens decomposition, `sim/unitarySynth.ts`) — a general but
 * non-CNOT-optimal universal decomposition. Opens the result in a new tab;
 * the Equivalence panel will confirm it matches. Capped at 4 qubits;
 * default-collapsed.
 */
export function UnitarySynthPanel(props: Props) {
  return (
    <PanelShell id="unitary-synth" title="Unitary synthesis (two-level)" defaultCollapsed>
      <Body {...props} />
    </PanelShell>
  );
}

/** Build the current circuit's dim×dim complex unitary, column by column. */
function circuitUnitary(circuit: Circuit, params: ParameterValues, customGates: CustomGate[], n: number): Cx[][] | null {
  const dim = 1 << n;
  const U: Cx[][] = Array.from({ length: dim }, () => Array.from({ length: dim }, () => ({ re: 0, im: 0 })));
  for (let j = 0; j < dim; j++) {
    const res = simulate(circuit, params, customGates, { startIndex: j });
    if (res.isStabilizer) return null;
    for (let i = 0; i < dim; i++) U[i][j] = { re: res.state[2 * i], im: res.state[2 * i + 1] };
  }
  return U;
}

function Body({ circuit, customGates, paramValues, onLoadInNewTab }: Props) {
  const collapsed = usePanelCollapsed();
  const [info, setInfo] = useState<{ gates: number; cx: number; depth: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const n = circuit.numQubits;

  if (collapsed) return null;
  if (n < 1) return <div className="panel__placeholder">place some gates first</div>;
  if (n > MAX_QUBITS) return <div className="panel__notice">{n} qubits — unitary synthesis capped at {MAX_QUBITS}.</div>;

  const run = () => {
    setErr(null);
    const U = circuitUnitary(circuit, paramValues, customGates, n);
    if (!U) { setErr("not available on the Clifford fast path"); return; }
    const gates = synthesizeUnitary(U, n);
    if (!gates) { setErr("synthesis failed"); return; }
    const out: Circuit = { numQubits: n, numClbits: 0, gates, name: "unitary synthesis" };
    const r = estimateResources(out);
    setInfo({ gates: r.totalGates, cx: r.cxCount, depth: r.parallelDepth });
    onLoadInNewTab(out, "unitary synthesis");
  };

  return (
    <div className="cplot">
      <div className="sprep__row">
        <button className="cplot__add sprep__go" onClick={run}>Synthesize current unitary → new tab</button>
      </div>
      <div className="sprep__hint">
        re-expresses this circuit's 2ⁿ×2ⁿ unitary as controlled-u_arb two-level gates (universal, not CNOT-optimal). Use the Equivalence panel to confirm.
      </div>
      {err && <div className="panel__notice">{err}</div>}
      {info && (
        <div className="sprep__hint">opened: {info.gates} gates · {info.cx} CX · depth {info.depth}</div>
      )}
    </div>
  );
}
