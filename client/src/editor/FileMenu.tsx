import { useRef } from "react";
import type { Circuit } from "./types";
import type { HistoryAction } from "./state";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import { EXAMPLE_CATEGORIES, EXAMPLES } from "../examples";

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
};

/** Slugify a name into something safe for a file system download. */
function toFilename(name: string | undefined): string {
  const base = (name ?? "circuit").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "circuit") + ".qasm";
}

export function FileMenu({ circuit, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadQasm = (qasm: string, name: string | undefined) => {
    const result = parseQasm3(qasm);
    if (!result.ok) {
      window.alert(`Parse error on line ${result.line}: ${result.error}`);
      return;
    }
    dispatch({ type: "replace-circuit", circuit: { ...result.circuit, name } });
  };

  const onOpen = () => fileInputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    // Drop the .qasm extension for the displayed title.
    const name = f.name.replace(/\.qasm$/i, "");
    loadQasm(text, name);
    e.target.value = "";
  };

  const onDownload = () => {
    const text = emitQasm3(circuit);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = toFilename(circuit.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const onExampleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    const ex = EXAMPLES.find((x) => x.id === id);
    if (ex) loadQasm(ex.qasm, ex.label);
    e.target.value = "";
  };

  return (
    <div className="file-menu">
      <input
        ref={fileInputRef}
        type="file"
        accept=".qasm,.txt"
        style={{ display: "none" }}
        onChange={onFile}
      />
      <button onClick={onOpen} title="Open a .qasm file">Open</button>
      <button onClick={onDownload} title="Download as .qasm">Download</button>
      <select className="file-menu__examples" onChange={onExampleChange} defaultValue="" title="Load an example">
        <option value="">Examples…</option>
        {EXAMPLE_CATEGORIES.map((cat) => (
          <optgroup key={cat.label} label={cat.label}>
            {cat.items.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
