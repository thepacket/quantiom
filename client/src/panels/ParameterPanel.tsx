import { useEffect, useRef, useState } from "react";
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
  if (name === "t") return "t";
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

const TWO_PI = 2 * Math.PI;

export function ParameterPanel({ state, values, onChange }: Props) {
  const data = dataOf(state);
  const symbols = data?.freeSymbols ?? [];
  const tInSymbols = symbols.includes("t");
  const otherSymbols = symbols.filter((s) => s !== "t");

  // ── Animated `t` parameter ──────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5); // cycles per second
  const startTimeRef = useRef<number>(0);
  const startTRef = useRef<number>(0);

  useEffect(() => {
    if (!tInSymbols && playing) setPlaying(false);
  }, [tInSymbols, playing]);

  // Seed any newly-detected free symbol to 0 so the numeric panels light up
  // immediately without requiring the user to drag every slider once.
  useEffect(() => {
    const missing = symbols.filter((s) => !(s in values));
    if (missing.length === 0) return;
    const additions: ParameterValues = {};
    for (const m of missing) additions[m] = 0;
    onChange({ ...values, ...additions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join("|")]);

  useEffect(() => {
    if (!playing) return;
    startTimeRef.current = performance.now();
    startTRef.current = values.t ?? 0;
    let handle = 0;
    const tick = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const newT = (startTRef.current + elapsed * speed * TWO_PI) % TWO_PI;
      onChange({ ...values, t: newT });
      handle = window.setTimeout(tick, 66); // ~15fps
    };
    handle = window.setTimeout(tick, 0);
    return () => window.clearTimeout(handle);
    // We intentionally omit `values` from deps — tick reads it from closure at
    // the start of playback and updates onChange itself. Re-running on every
    // onChange would cancel and restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  if (symbols.length === 0) return null;

  const updateValue = (name: string, v: number) => {
    onChange({ ...values, [name]: v });
  };

  return (
    <PanelShell id="parameters" title="Parameters">
      {tInSymbols && (
        <div className="params__time">
          <button
            className={"params__play" + (playing ? " params__play--on" : "")}
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause" : "Play — animate t around the unit circle"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="params__time-rows">
            <div className="params__row">
              <label className="params__label">t</label>
              <input
                className="params__slider"
                type="range"
                min={0}
                max={TWO_PI}
                step={0.01}
                value={values.t ?? 0}
                onChange={(e) => updateValue("t", parseFloat(e.target.value))}
              />
              <input
                className="params__num"
                type="number"
                step={0.01}
                value={(values.t ?? 0).toFixed(2)}
                onChange={(e) => updateValue("t", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="params__row params__row--speed">
              <label className="params__label params__label--small">Hz</label>
              <input
                className="params__slider"
                type="range"
                min={0.05}
                max={3}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
              />
              <span className="params__num params__num--readonly">{speed.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="params__list">
        {otherSymbols.map((name) => {
          const v = values[name] ?? 0;
          return (
            <div key={name} className="params__row">
              <label className="params__label">{display(name)}</label>
              <input
                className="params__slider"
                type="range"
                min={-TWO_PI}
                max={TWO_PI}
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
      </div>
      {otherSymbols.length > 0 && (
        <div className="params__hint">drag a slider to set this parameter's value</div>
      )}
    </PanelShell>
  );
}
