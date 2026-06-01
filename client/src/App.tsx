import { CircuitEditor } from "./editor/CircuitEditor";

export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Quantiom</h1>
        <span className="app__tagline">circuit editor · simulator · sonorizer · visualizer</span>
      </header>
      <main className="app__main">
        <CircuitEditor />
        <aside className="app__panels">
          <section className="panel">
            <h2>Statevector</h2>
            <p className="panel__placeholder">symbolic · numeric</p>
          </section>
          <section className="panel">
            <h2>Q-sphere</h2>
            <p className="panel__placeholder">placeholder</p>
          </section>
          <section className="panel">
            <h2>Probabilities</h2>
            <p className="panel__placeholder">placeholder</p>
          </section>
          <section className="panel">
            <h2>Sonorizer</h2>
            <p className="panel__placeholder">placeholder</p>
          </section>
          <section className="panel">
            <h2>Formal math</h2>
            <p className="panel__placeholder">placeholder</p>
          </section>
        </aside>
      </main>
    </div>
  );
}
