import { useMemo, useState } from "react";
import type { Circuit } from "../editor/types";
import { emitQasm3 } from "../qasm/emit";

type Props = { circuit: Circuit };

export function QasmPanel({ circuit }: Props) {
  const qasm = useMemo(() => emitQasm3(circuit), [circuit]);
  const [copied, setCopied] = useState(false);
  const lines = qasm.split("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(qasm);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // No-op — clipboard may be unavailable in some contexts.
    }
  };

  return (
    <section className="panel panel--qasm">
      <header className="panel__head">
        <h2>OpenQASM 3</h2>
        <div className="panel__toolbar">
          <button onClick={onCopy}>{copied ? "copied" : "copy"}</button>
        </div>
      </header>
      <pre className="qasm__code">
        {lines.map((line, i) => (
          <div key={i} className="qasm__line">
            <span className="qasm__ln">{i + 1}</span>
            <code>{line || " "}</code>
          </div>
        ))}
      </pre>
    </section>
  );
}
