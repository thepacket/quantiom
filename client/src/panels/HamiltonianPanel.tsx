import { useMemo, useState } from "react";
import { PanelShell } from "./PanelShell";
import { buildTrotterCircuit, parsePauliSum, pauliSumQubitCount, type PauliTerm } from "../sim/trotter";
import type { Circuit } from "../editor/types";

type Props = {
  onLoadInNewTab: (circuit: Circuit, name?: string) => void;
};

const PRESETS: Array<{ id: string; label: string; text: string; name: string }> = [
  { id: "tfim", label: "Transverse-field Ising (4q)", name: "TFIM Trotter", text: "1*ZZII + 1*IZZI + 1*IIZZ + 0.5*XIII + 0.5*IXII + 0.5*IIXI + 0.5*IIIX" },
  { id: "xxz", label: "XXZ chain (3q)", name: "XXZ Trotter", text: "1*XXI + 1*IXX + 1*YYI + 1*IYY + 0.7*ZZI + 0.7*IZZ" },
  { id: "h2", label: "H₂ molecule (4q, demo)", name: "H₂ Trotter", text: "-0.81*ZIII + 0.17*IIZI + 0.17*IZII - 0.22*IIIZ + 0.12*ZZII + 0.17*IZZI + 0.04*XYYX" },
  { id: "heisenberg", label: "Heisenberg ladder (4q)", name: "Heisenberg Trotter", text: "1*XXII + 1*YYII + 1*ZZII + 1*IXXI + 1*IYYI + 1*IZZI + 1*IIXX + 1*IIYY + 1*IIZZ" },
];

export function HamiltonianPanel({ onLoadInNewTab }: Props) {
  return (
    <PanelShell id="hamiltonian" title="Hamiltonian → Trotter circuit" defaultCollapsed>
      <Body onLoadInNewTab={onLoadInNewTab} />
    </PanelShell>
  );
}

function Body({ onLoadInNewTab }: Props) {
  const [text, setText] = useState<string>(PRESETS[0].text);
  const [steps, setSteps] = useState<number>(1);
  const [delta, setDelta] = useState<string>("t");
  const [name, setName] = useState<string>(PRESETS[0].name);

  const parsed = useMemo<{ ok: true; terms: PauliTerm[]; n: number } | { ok: false; error: string }>(() => {
    try {
      const terms = parsePauliSum(text);
      return { ok: true, terms, n: pauliSumQubitCount(terms) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);

  const generate = () => {
    if (!parsed.ok) return;
    const circuit = buildTrotterCircuit(parsed.terms, {
      steps: Math.max(1, Math.min(20, Math.floor(steps))),
      delta: delta || "t",
      name,
    });
    onLoadInNewTab(circuit, name);
  };

  return (
    <div className="hamil">
      <div className="hamil__presets">
        <label>preset</label>
        <select
          defaultValue=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) { setText(p.text); setName(p.name); }
            e.target.value = "";
          }}
        >
          <option value="">choose…</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <p className="hamil__hint">
        Pauli-sum input — terms separated by + / -; each term is `coef * P_n…P_0` with P ∈ {`I, X, Y, Z`}.
        Pauli strings are big-endian (leftmost char = qubit 0). Delta drives R(θ=2hδ) on each
        Trotter step; leave as `t` to animate via the parameters panel's clock.
      </p>
      <textarea
        className="hamil__text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        spellCheck={false}
      />
      {parsed.ok ? (
        <div className="hamil__summary">
          {parsed.terms.length} terms · {parsed.n} qubits
        </div>
      ) : (
        <div className="panel__error">✗ {parsed.error}</div>
      )}
      <div className="hamil__config">
        <label>steps
          <input
            type="number"
            min={1}
            max={20}
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value || "1", 10))}
          />
        </label>
        <label>δ
          <input
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            style={{ width: 60 }}
            placeholder="t"
          />
        </label>
        <label>name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 120 }} />
        </label>
        <button
          className="hamil__build"
          onClick={generate}
          disabled={!parsed.ok}
          title="Generate the Trotter circuit and open in a new tab"
        >
          Generate
        </button>
      </div>
    </div>
  );
}
