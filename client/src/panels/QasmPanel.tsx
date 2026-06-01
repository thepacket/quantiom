import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import type { HistoryAction } from "../editor/state";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import { PanelShell } from "./PanelShell";

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
};

const PARSE_DEBOUNCE_MS = 350;

export function QasmPanel({ circuit, dispatch }: Props) {
  const [text, setText] = useState<string>(() => emitQasm3(circuit));
  const [editing, setEditing] = useState(false);
  const [parseError, setParseError] = useState<{ line: number; message: string } | null>(null);
  const [warnings, setWarnings] = useState<Array<{ line: number; message: string }>>([]);
  const [copied, setCopied] = useState(false);
  const parseTimer = useRef<number | null>(null);
  const lastDispatchedRef = useRef<string>("");

  // External circuit changes overwrite the textarea ONLY when the user isn't editing.
  useEffect(() => {
    if (editing) return;
    const emitted = emitQasm3(circuit);
    setText(emitted);
    lastDispatchedRef.current = emitted;
    setParseError(null);
    setWarnings([]);
  }, [circuit, editing]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setText(next);
    if (parseTimer.current) window.clearTimeout(parseTimer.current);
    parseTimer.current = window.setTimeout(() => parseAndDispatch(next), PARSE_DEBOUNCE_MS);
  };

  const parseAndDispatch = (source: string) => {
    const result = parseQasm3(source);
    if (!result.ok) {
      setParseError({ line: result.line, message: result.error });
      setWarnings([]);
      return;
    }
    setParseError(null);
    setWarnings(result.warnings);
    // Avoid dispatching if the resulting circuit emits the same QASM we already
    // dispatched — prevents pointless undo entries when the user types whitespace.
    const reemitted = emitQasm3(result.circuit);
    if (reemitted === lastDispatchedRef.current) return;
    lastDispatchedRef.current = reemitted;
    dispatch({ type: "replace-circuit", circuit: result.circuit });
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const lineCount = text.split("\n").length;

  return (
    <PanelShell
      id="qasm"
      title="OpenQASM 3"
      className="panel--qasm"
      toolbar={<button onClick={onCopy}>{copied ? "copied" : "copy"}</button>}
    >
      <div className="qasm__editor">
        <div className="qasm__lns" aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={parseError && parseError.line === i + 1 ? "qasm__ln qasm__ln--error" : "qasm__ln"}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          className="qasm__text"
          value={text}
          spellCheck={false}
          onChange={onChange}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          wrap="off"
        />
      </div>
      {parseError && (
        <div className="qasm__error">
          line {parseError.line}: {parseError.message}
        </div>
      )}
      {warnings.length > 0 && !parseError && (
        <ul className="qasm__warnings">
          {warnings.map((w, i) => (
            <li key={i}>
              line {w.line}: {w.message}
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
