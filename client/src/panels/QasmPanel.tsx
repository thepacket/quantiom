import { useEffect, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import type { HistoryAction } from "../editor/state";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import { PanelShell, usePanelCollapsed } from "./PanelShell";

type Props = {
  circuit: Circuit;
  dispatch: React.Dispatch<HistoryAction>;
};

const PARSE_DEBOUNCE_MS = 350;

export function QasmPanel({ circuit, dispatch }: Props) {
  // Shared ref so the outer panel's copy button can read whatever text the
  // editable body is showing right now without forcing a state hoist.
  const textRef = useRef<string>("");
  return (
    <PanelShell
      id="qasm"
      title="OpenQASM 3"
      className="panel--qasm"
      getCopyText={() => textRef.current}
    >
      <QasmBody circuit={circuit} dispatch={dispatch} textRef={textRef} />
    </PanelShell>
  );
}

function QasmBody({
  circuit,
  dispatch,
  textRef,
}: Props & { textRef: React.MutableRefObject<string> }) {
  const collapsed = usePanelCollapsed();
  const [text, setText] = useState<string>(() => emitQasm3(circuit));
  const [editing, setEditing] = useState(false);
  const [parseError, setParseError] = useState<{ line: number; message: string } | null>(null);
  const [warnings, setWarnings] = useState<Array<{ line: number; message: string }>>([]);
  const parseTimer = useRef<number | null>(null);
  const lastDispatchedRef = useRef<string>("");

  useEffect(() => {
    textRef.current = text;
  }, [text, textRef]);

  // External circuit changes overwrite the textarea ONLY when the user isn't
  // editing and the panel is visible. Skipping emitQasm3 while collapsed
  // avoids the O(g) walk on every state update.
  useEffect(() => {
    if (editing || collapsed) return;
    const emitted = emitQasm3(circuit);
    setText(emitted);
    lastDispatchedRef.current = emitted;
    setParseError(null);
    setWarnings([]);
  }, [circuit, editing, collapsed]);

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
    const reemitted = emitQasm3(result.circuit);
    if (reemitted === lastDispatchedRef.current) return;
    lastDispatchedRef.current = reemitted;
    dispatch({ type: "replace-circuit", circuit: result.circuit });
  };

  const lineCount = text.split("\n").length;

  return (
    <>
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
    </>
  );
}
