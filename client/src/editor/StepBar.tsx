type Props = {
  /** Highest column index used by any gate. -1 if the circuit is empty. */
  maxColumn: number;
  /** Current step (column index up to which gates are applied). -1 means
   *  the initial |0…0⟩ state, before any gate. */
  step: number;
  onChange: (next: number) => void;
};

export function StepBar({ maxColumn, step, onChange }: Props) {
  const clamped = Math.max(-1, Math.min(step, maxColumn));
  const atStart = clamped <= -1;
  const atEnd = clamped >= maxColumn;
  const stepDisplay = clamped + 1;
  const total = Math.max(0, maxColumn + 1);

  return (
    <div className="step-bar" title="Step through the circuit column by column">
      <button
        className="step-bar__btn"
        onClick={() => onChange(-1)}
        disabled={atStart}
        title="Jump to initial state"
      >⏮</button>
      <button
        className="step-bar__btn"
        onClick={() => onChange(Math.max(-1, clamped - 1))}
        disabled={atStart}
        title="Step back one column"
      >◀</button>
      <input
        className="step-bar__slider"
        type="range"
        min={-1}
        max={maxColumn}
        step={1}
        value={clamped}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={maxColumn < 0}
      />
      <button
        className="step-bar__btn"
        onClick={() => onChange(Math.min(maxColumn, clamped + 1))}
        disabled={atEnd}
        title="Step forward one column"
      >▶</button>
      <button
        className="step-bar__btn"
        onClick={() => onChange(maxColumn)}
        disabled={atEnd}
        title="Jump to end"
      >⏭</button>
      <span className="step-bar__count">step {stepDisplay} / {total}</span>
    </div>
  );
}
