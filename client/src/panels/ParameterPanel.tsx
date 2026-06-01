import type { ParameterValues } from "../api";
import type { SimState } from "./useSimulation";
import { dataOf } from "./useSimulation";
import { PanelShell } from "./PanelShell";

type Props = {
  state: SimState;
  values: ParameterValues;
  onChange: (next: ParameterValues) => void;
};

const ASCII_TO_GLYPH: Record<string, string> = {
  theta: "θ",
  phi: "φ",
  lambda: "λ",
  gamma: "γ",
  beta: "β",
  tau: "τ",
  alpha: "α",
  delta: "δ",
  omega: "ω",
};

function display(name: string): string {
  // Map theta_0 → θ₀ when there's a trailing _number suffix.
  const m = name.match(/^([a-zA-Z]+)(?:_(\d+))?$/);
  if (m) {
    const base = ASCII_TO_GLYPH[m[1]] ?? m[1];
    if (m[2]) {
      const subscript = m[2].split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[parseInt(d, 10)]).join("");
      return base + subscript;
    }
    return base;
  }
  return name;
}

export function ParameterPanel({ state, values, onChange }: Props) {
  const data = dataOf(state);
  const symbols = data?.freeSymbols ?? [];
  if (symbols.length === 0) return null;

  const updateValue = (name: string, v: number) => {
    onChange({ ...values, [name]: v });
  };

  return (
    <PanelShell id="parameters" title="Parameters">
      <div className="params__list">
        {symbols.map((name) => {
          const v = values[name] ?? 0;
          return (
            <div key={name} className="params__row">
              <label className="params__label">{display(name)}</label>
              <input
                className="params__slider"
                type="range"
                min={-Math.PI * 2}
                max={Math.PI * 2}
                step={0.01}
                value={v}
                onChange={(e) => updateValue(name, parseFloat(e.target.value))}
              />
              <input
                className="params__num"
                type="number"
                step={0.01}
                value={v.toFixed(2)}
                onChange={(e) => updateValue(name, parseFloat(e.target.value) || 0)}
              />
            </div>
          );
        })}
        <div className="params__hint">drag a slider to substitute a value; ket display stays symbolic</div>
      </div>
    </PanelShell>
  );
}
