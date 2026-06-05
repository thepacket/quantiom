import { CircuitEditor } from "./editor/CircuitEditor";
import { EndiannessProvider } from "./panels/endianness";

export function App() {
  return (
    <EndiannessProvider>
      <div className="app">
        <CircuitEditor />
      </div>
    </EndiannessProvider>
  );
}
