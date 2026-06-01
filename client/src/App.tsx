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
      </main>
    </div>
  );
}
