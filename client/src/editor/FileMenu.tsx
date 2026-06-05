import { useEffect, useMemo, useRef, useState } from "react";
import type { Circuit } from "./types";
import type { HistoryAction } from "./state";
import { emitQasm3 } from "../qasm/emit";
import { emitQasm2 } from "../qasm/emitQasm2";
import { emitQiskit } from "../qasm/emitQiskit";
import { emitCirq } from "../qasm/emitCirq";
import { emitBraket } from "../qasm/emitBraket";
import { emitQSharp } from "../qasm/emitQSharp";
import { emitPyQuil } from "../qasm/emitPyQuil";
import { emitPytket } from "../qasm/emitPytket";
import { emitQuantikz } from "../qasm/emitQuantikz";
import { parseQasm3 } from "../qasm/parse";
import { EXAMPLE_CATEGORIES, type Example } from "../examples";
import { downloadCanvasSvg } from "./exportSvg";
import { buildShareURL } from "./shareLink";

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
  /** When provided, "Open" and Examples create a new tab instead of
   *  replacing the current circuit. Used by the multi-tab editor. */
  onLoadInNewTab?: (circuit: Circuit, name?: string) => void;
  /** Current parameter values, used to bind free symbols when exporting to
   *  OpenQASM 2 (which has no symbolic parameters). */
  paramValues?: Record<string, number>;
};

/** Slugify a name into something safe for a file system download. */
function toFilename(name: string | undefined): string {
  const base = (name ?? "circuit").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "circuit") + ".qasm";
}

export function FileMenu({ circuit, dispatch, onLoadInNewTab, paramValues }: Props) {
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

  const downloadText = (text: string, ext: string, mime: string) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (toFilename(circuit.name).replace(/\.qasm$/, "") || "circuit") + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };
  const onDownloadQasm2 = () => downloadText(emitQasm2(circuit, paramValues ?? {}), "_qasm2.qasm", "text/plain;charset=utf-8");
  const onDownloadQiskit = () => downloadText(emitQiskit(circuit), ".py", "text/x-python;charset=utf-8");
  const onDownloadCirq = () => downloadText(emitCirq(circuit), "_cirq.py", "text/x-python;charset=utf-8");
  const onDownloadBraket = () => downloadText(emitBraket(circuit), "_braket.py", "text/x-python;charset=utf-8");
  const onDownloadQSharp = () => downloadText(emitQSharp(circuit), ".qs", "text/plain;charset=utf-8");
  const onDownloadPyQuil = () => downloadText(emitPyQuil(circuit), "_pyquil.py", "text/x-python;charset=utf-8");
  const onDownloadPytket = () => downloadText(emitPytket(circuit), "_pytket.py", "text/x-python;charset=utf-8");
  const onDownloadQuantikz = () => downloadText(emitQuantikz(circuit), ".tex", "text/x-tex;charset=utf-8");
  const onDownloadJson = () => downloadText(JSON.stringify(circuit, null, 2), ".json", "application/json;charset=utf-8");

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

  const [examplesOpen, setExamplesOpen] = useState(false);
  const onExamplePick = (ex: Example) => {
    loadQasm(ex.qasm, ex.label, !!onLoadInNewTab);
    setExamplesOpen(false);
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
      <FileDropdown
        onOpenExamples={() => setExamplesOpen(true)}
        onOpenQasm={onOpen}
        onDownloadQasm={onDownload}
        onShare={onShare}
        shareStatus={shareStatus}
        onQasm2={onDownloadQasm2}
        onQiskit={onDownloadQiskit}
        onCirq={onDownloadCirq}
        onBraket={onDownloadBraket}
        onQSharp={onDownloadQSharp}
        onPyQuil={onDownloadPyQuil}
        onPytket={onDownloadPytket}
        onQuantikz={onDownloadQuantikz}
        onJson={onDownloadJson}
        onSvg={() => downloadCanvasSvg(circuit.name)}
      />
      <ExamplesPicker open={examplesOpen} onToggle={() => setExamplesOpen((o) => !o)} onPick={onExamplePick} />
    </div>
  );
}

/**
 * Consolidated File menu. Replaces the old three standalone buttons
 * (Open / .qasm / Export…) with one dropdown. Export targets render as
 * a labelled sub-section below the import / download primary items —
 * same flat-with-category-label pattern as TransformMenu.
 */
function FileDropdown({
  onOpenExamples,
  onOpenQasm,
  onDownloadQasm,
  onShare,
  shareStatus,
  onQasm2,
  onQiskit,
  onCirq,
  onBraket,
  onQSharp,
  onPyQuil,
  onPytket,
  onQuantikz,
  onJson,
  onSvg,
}: {
  onOpenExamples: () => void;
  onOpenQasm: () => void;
  onDownloadQasm: () => void;
  onShare: () => void;
  shareStatus: "idle" | "copied" | "failed";
  onQasm2: () => void;
  onQiskit: () => void;
  onCirq: () => void;
  onBraket: () => void;
  onQSharp: () => void;
  onPyQuil: () => void;
  onPytket: () => void;
  onQuantikz: () => void;
  onJson: () => void;
  onSvg: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const item = (label: string, hint: string, fn: () => void) => (
    <button
      className="examples-picker__item"
      onClick={() => { setOpen(false); fn(); }}
      title={hint}
    >
      <span>{label}</span>
      <span className="export-picker__hint">{hint}</span>
    </button>
  );
  return (
    <div className="examples-picker" ref={wrapRef}>
      <button className="examples-picker__btn" onClick={() => setOpen((o) => !o)} title="Open, download, export">
        File
      </button>
      {open && (
        <div className="examples-picker__pop">
          <div className="examples-picker__list">
            {item("Examples…", "browse the example circuit library", onOpenExamples)}
            {item("Open QASM…", "load a .qasm file from disk", onOpenQasm)}
            {item("Download QASM", "save current circuit as .qasm", onDownloadQasm)}
            {item(
              shareStatus === "copied" ? "Share — ✓ link copied"
                : shareStatus === "failed" ? "Share — failed"
                : "Share",
              "copy a shareable URL (circuit encoded in the link's hash)",
              onShare,
            )}
            <div className="examples-picker__cat-label">Export →</div>
            {item("OpenQASM 2", "_qasm2.qasm — legacy", onQasm2)}
            {item("Qiskit", ".py — IBM", onQiskit)}
            {item("Cirq", "_cirq.py — Google", onCirq)}
            {item("Braket SDK", "_braket.py — AWS", onBraket)}
            {item("Q#", ".qs — Microsoft", onQSharp)}
            {item("PyQuil", "_pyquil.py — Rigetti", onPyQuil)}
            {item("pytket", "_pytket.py — Quantinuum", onPytket)}
            {item("LaTeX (quantikz)", ".tex — for papers", onQuantikz)}
            {item("JSON", ".json — raw IR", onJson)}
            {item("SVG", "vector canvas image", onSvg)}
          </div>
        </div>
      )}
    </div>
  );
}

function ExamplesPicker({
  open,
  onToggle,
  onPick,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (ex: Example) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus the search input next tick.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EXAMPLE_CATEGORIES;
    return EXAMPLE_CATEGORIES
      .map((cat) => ({
        label: cat.label,
        items: cat.items.filter(
          (ex) => ex.label.toLowerCase().includes(q) || ex.id.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  return (
    <div className="examples-picker" ref={wrapRef} style={{ display: open ? undefined : "none" }}>
      {open && (
        <div className="examples-picker__pop">
          <input
            ref={inputRef}
            className="examples-picker__search"
            type="text"
            placeholder={`Search ${EXAMPLE_CATEGORIES.reduce((n, c) => n + c.items.length, 0)} examples…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onToggle();
              if (e.key === "Enter") {
                const first = groups[0]?.items[0];
                if (first) onPick(first);
              }
            }}
          />
          <div className="examples-picker__list">
            {groups.length === 0 && <div className="examples-picker__none">No matches.</div>}
            {groups.map((cat) => (
              <div key={cat.label} className="examples-picker__cat">
                <div className="examples-picker__cat-label">{cat.label}</div>
                {cat.items.map((ex) => (
                  <button
                    key={ex.id}
                    className="examples-picker__item"
                    onClick={() => onPick(ex)}
                    title={ex.description || ex.id}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
