export function CircuitEditor() {
  const qubits = [0, 1, 2];
  return (
    <section className="editor">
      <h2 className="editor__title">Circuit</h2>
      <div className="editor__wires">
        {qubits.map((q) => (
          <div key={q} className="wire">
            <span className="wire__label">q{q}</span>
            <div className="wire__line" />
          </div>
        ))}
      </div>
    </section>
  );
}
