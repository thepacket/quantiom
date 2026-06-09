import { useMemo, useState } from "react";
import { PanelShell } from "./PanelShell";
import { statePrepCircuit, parseTargetState } from "../sim/statePrep";
import { estimateResources } from "../sim/resources";
import type { Circuit } from "../editor/types";

type Props = { onLoadInNewTab: (circuit: Circuit, name?: string) => void };

const PRESETS: Array<{ label: string; n: number; text: string }> = [
  { label: "Bell (2q)", n: 2, text: "1, 0, 0, 1" },
  { label: "W state (3q)", n: 3, text: "0, 1, 1, 0, 1, 0, 0, 0" },
  { label: "GHZ (3q)", n: 3, text: "1,0,0,0,0,0,0,1" },
  { label: "Basis |011⟩ (3q)", n: 3, text: "011" },
  { label: "Phased pair (2q)", n: 2, text: "1, i, -i, 1" },
];

/**
 * State-preparation synthesis. Type a target statevector (an amplitude list
 * of length 2ⁿ — reals or `a+bi` complex — or a basis-state label like `011`)
 * and synthesize a circuit of RY/RZ/CX gates that prepares it from |0…0⟩
 * (Möttönen amplitude/phase encoding, `sim/statePrep.ts`). Opens the result
 * in a new tab. Default-collapsed.
 */
export function StatePrepPanel({ onLoadInNewTab }: Props) {
  return (
    <PanelShell id="state-prep" title="State preparation (synthesis)" defaultCollapsed>
      <Body onLoadInNewTab={onLoadInNewTab} />
    </PanelShell>
  );
}

function Body({ onLoadInNewTab }: Props) {
  const [n, setN] = useState(2);
  const [text, setText] = useState("1, 0, 0, 1");

  const parsed = useMemo(() => parseTargetState(text, n), [text, n]);
  const circuit = useMemo(() => (parsed ? statePrepCircuit(parsed.re, parsed.im, n, "state prep") : null), [parsed, n]);
  const res = useMemo(() => (circuit ? estimateResources(circuit) : null), [circuit]);

  const applyPreset = (p: { n: number; text: string }) => { setN(p.n); setText(p.text); };

  return (
    <div className="cplot">
      <div className="sprep__row">
        <label className="cplot__field">
          <span>qubits</span>
          <select value={n} onChange={(e) => setN(parseInt(e.target.value, 10))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span className="sprep__hint">amplitude list of 2ⁿ = {1 << n} values, or a basis label</span>
      </div>
      <textarea
        className="cplot__code"
        value={text}
        spellCheck={false}
        rows={2}
        placeholder="1, 0, 0, 1  (or  011,  or  0.5, 0.5+0.5i, …)"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sprep__presets">
        {PRESETS.map((p) => (
          <button key={p.label} className="cplot__add" onClick={() => applyPreset(p)} title={p.text}>{p.label}</button>
        ))}
      </div>
      {!parsed ? (
        <div className="panel__notice">need exactly {1 << n} amplitudes (or an {n}-bit basis label like {"0".repeat(n)}).</div>
      ) : circuit && res ? (
        <div className="sprep__out">
          <button
            className="cplot__add sprep__go"
            onClick={() => onLoadInNewTab(circuit, "state prep")}
          >
            Synthesize → new tab
          </button>
          <span className="sprep__hint">{res.totalGates} gates · {res.cxCount} CX · depth {res.parallelDepth}</span>
        </div>
      ) : (
        <div className="panel__notice">could not synthesize this target.</div>
      )}
    </div>
  );
}
