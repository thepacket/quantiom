import { useRef, useState } from "react";
import type { Circuit } from "./types";
import type { HistoryAction } from "./state";
import { emitQasm3 } from "../qasm/emit";
import { emitQiskit } from "../qasm/emitQiskit";
import { parseQasm3 } from "../qasm/parse";
import { EXAMPLE_CATEGORIES, EXAMPLES } from "../examples";
import { downloadCanvasSvg } from "./exportSvg";
import { buildShareURL } from "./shareLink";

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
  /** When provided, "Open" and Examples create a new tab instead of
   *  replacing the current circuit. Used by the multi-tab editor. */
  onLoadInNewTab?: (circuit: Circuit, name?: string) => void;
};

/** Slugify a name into something safe for a file system download. */
function toFilename(name: string | undefined): string {
  const base = (name ?? "circuit").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "circuit") + ".qasm";
}

export function FileMenu({ circuit, dispatch, onLoadInNewTab }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");

  const loadQasm = (qasm: string, name: string | undefined, inNewTab = false) => {
    const result = parseQasm3(qasm);
    if (!result.ok) {
      window.alert(`Parse error on line ${result.line}: ${result.error}`);
      return;
    }
    const c = { ...result.circuit, name };
    if (inNewTab && onLoadInNewTab) onLoadInNewTab(c, name);
    else dispatch({ type: "replace-circuit", circuit: c });
  };

  const onOpen = () => fileInputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    // Drop the .qasm extension for the displayed title.
    const name = f.name.replace(/\.qasm$/i, "");
    // Default to a new tab when the multi-tab handler is wired in.
    loadQasm(text, name, !!onLoadInNewTab);
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

  const onDownloadQiskit = () => {
    const text = emitQiskit(circuit);
    const blob = new Blob([text], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (toFilename(circuit.name).replace(/\.qasm$/, "") || "circuit") + ".py";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const onShare = async () => {
    try {
      const url = await buildShareURL(circuit);
      await navigator.clipboard.writeText(url);
      // Also update the address bar so a refresh reproduces the circuit.
      history.replaceState(null, "", url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 1500);
    } catch {
      setShareStatus("failed");
      setTimeout(() => setShareStatus("idle"), 1500);
    }
  };

  const onExampleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    const ex = EXAMPLES.find((x) => x.id === id);
    if (ex) loadQasm(ex.qasm, ex.label, !!onLoadInNewTab);
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
      <button onClick={onDownload} title="Download as .qasm">.qasm</button>
      <button onClick={onDownloadQiskit} title="Download as a Qiskit Python script">.py</button>
      <button onClick={() => downloadCanvasSvg(circuit.name)} title="Export the canvas as SVG">SVG</button>
      <button
        onClick={onShare}
        title="Copy a shareable URL that encodes the entire circuit in the link's hash"
      >
        {shareStatus === "copied" ? "✓ link" : shareStatus === "failed" ? "fail" : "Share"}
      </button>
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
