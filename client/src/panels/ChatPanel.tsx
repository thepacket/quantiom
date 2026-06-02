import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import {
  listModels,
  streamChat,
  type ChatMessage,
  type OpenRouterModel,
} from "../sim/openrouter";
import {
  loadApiKey, saveApiKey,
  loadModel, saveModel,
  loadHistory, saveHistory,
  loadHeight, saveHeight,
  loadOpen, saveOpen,
} from "./chatStorage";

/**
 * AI chat panel. Bottom row of the editor grid; resizable via a top
 * drag handle. Talks to OpenRouter directly from the browser (no proxy).
 *
 * The user's OpenRouter API key lives in localStorage; the panel does not
 * send it anywhere except as a Bearer token on the OpenRouter request.
 *
 * On every assistant reply, the panel scans fenced ``` blocks. A block
 * whose first non-empty line contains `OPENQASM`, `qubit[`, or `qreg`
 * gets an "Open in new tab" affordance — clicking parses the QASM and
 * calls `onLoadInNewTab`.
 */

type Props = {
  circuit: Circuit;
  onLoadInNewTab: (circuit: Circuit, name?: string) => void;
};

const SYSTEM_PROMPT =
  "You are an assistant integrated into Quantiom, a browser-native " +
  "quantum-circuit editor for researchers already comfortable with quantum " +
  "computing. The user may attach the current circuit as OpenQASM 3 text. " +
  "When proposing a new circuit or modification, always emit it inside a " +
  "fenced code block starting with ```qasm or ```openqasm — Quantiom " +
  "auto-detects those blocks and offers to open them as a new tab. Be " +
  "concise; do not over-explain quantum-computing basics.";

export function ChatPanel({ circuit, onLoadInNewTab }: Props) {
  const [open, setOpen] = useState<boolean>(loadOpen);
  const [height, setHeight] = useState<number>(loadHeight);
  const [apiKey, setApiKey] = useState<string>(loadApiKey);
  const [model, setModel] = useState<string>(loadModel);
  const [history, setHistory] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [streamBuf, setStreamBuf] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { saveOpen(open); }, [open]);
  useEffect(() => { saveHeight(height); }, [height]);
  useEffect(() => { saveApiKey(apiKey); }, [apiKey]);
  useEffect(() => { saveModel(model); }, [model]);
  useEffect(() => { saveHistory(history); }, [history]);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, streamBuf, open]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!apiKey) { setError("Set your OpenRouter API key (Settings)"); return; }
    if (!model) { setError("Pick a model (Settings)"); return; }
    setError(null);

    // Always prefix the user's message with the current circuit's QASM —
    // the model needs context to give grounded answers; cheaper than
    // making the user remember to re-attach.
    const qasm = emitQasm3(circuit);
    const userContent =
      `Current circuit (OpenQASM 3, ${circuit.numQubits} qubits, ` +
      `${circuit.gates.length} gates):\n\n\`\`\`qasm\n${qasm}\n\`\`\`\n\n` +
      `User message:\n${text}`;

    const userMsg: ChatMessage = { role: "user", content: userContent };
    const msgs: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      userMsg,
    ];
    // Show only the user's actual text (without attached QASM) in history.
    const visibleUser: ChatMessage = { role: "user", content: text };
    setHistory((h) => [...h, visibleUser]);
    setInput("");
    setStreaming(true);
    setStreamBuf("");

    abortRef.current = streamChat(apiKey, model, msgs, {
      onDelta: (chunk) => setStreamBuf((b) => b + chunk),
      onDone: (full) => {
        setStreaming(false);
        abortRef.current = null;
        if (full.length > 0) setHistory((h) => [...h, { role: "assistant", content: full }]);
        setStreamBuf("");
        // Auto-open every detected QASM block as a new tab. Done here
        // (not in render) so reloading the page from history doesn't
        // re-open already-shown circuits.
        autoOpenQasmBlocks(full, onLoadInNewTab);
      },
      onError: (msg) => {
        setStreaming(false);
        abortRef.current = null;
        setError(msg);
        setStreamBuf("");
      },
    });
  }, [input, streaming, apiKey, model, circuit, history, onLoadInNewTab]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    if (streaming) return;
    setHistory([]);
    setStreamBuf("");
    setError(null);
  }, [streaming]);

  // Drag handle for height resize.
  const onResizeStart = useCallback((startEvent: React.MouseEvent) => {
    startEvent.preventDefault();
    const startY = startEvent.clientY;
    const startH = height;
    const onMove = (e: MouseEvent) => {
      const dy = startY - e.clientY;
      const next = Math.min(800, Math.max(120, startH + dy));
      setHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);


  // Collapsed strip: a thin always-visible bar at the bottom.
  if (!open) {
    return (
      <div className="chat chat--collapsed">
        <button className="chat__toggle" onClick={() => setOpen(true)} title="Open AI chat">
          ▴ AI chat
        </button>
      </div>
    );
  }

  return (
    <div className="chat" style={{ height }}>
      <div className="chat__resize" onMouseDown={onResizeStart} title="Drag to resize" />
      <div className="chat__header">
        <button className="chat__toggle" onClick={() => setOpen(false)} title="Hide chat">▾</button>
        <span className="chat__title">AI chat</span>
        <ModelPicker model={model} onPick={setModel} apiKey={apiKey} />
        <button className="chat__btn" onClick={() => setShowSettings((s) => !s)} title="API key & options">
          ⚙
        </button>
        <button className="chat__btn" onClick={clearChat} disabled={streaming || history.length === 0} title="Clear chat history">
          clear
        </button>
      </div>
      {showSettings && (
        <div className="chat__settings">
          <label className="chat__settings-row">
            <span>OpenRouter API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="chat__settings-note">
            Stored in this browser only (localStorage). Sent only to
            openrouter.ai as a Bearer token. Get a key at{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
          </div>
        </div>
      )}
      <div className="chat__messages" ref={scrollRef}>
        {history.length === 0 && !streamBuf && (
          <div className="chat__empty">
            Ask anything about the current circuit. Replies containing OpenQASM
            blocks open automatically as new tabs.
          </div>
        )}
        {history.map((m, i) => (
          <Message key={i} message={m} />
        ))}
        {streamBuf && (
          <Message
            message={{ role: "assistant", content: streamBuf }}
            inProgress
          />
        )}
        {error && <div className="chat__error">✗ {error}</div>}
      </div>
      <div className="chat__input-row">
        <textarea
          className="chat__input"
          value={input}
          placeholder={streaming ? "streaming…" : "Message (Enter to send · Shift+Enter for newline)"}
          rows={2}
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline; ⌘/Ctrl+Enter still
            // sends too so muscle memory from the old binding keeps working.
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          disabled={streaming}
        />
        {streaming ? (
          <button className="chat__send" onClick={stop} title="Stop streaming">stop</button>
        ) : (
          <button className="chat__send" onClick={send} disabled={!input.trim()} title="Send (⌘/Ctrl+Enter)">
            ASK
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Message rendering with QASM-block detection ───────────────────────

function Message({
  message,
  inProgress,
}: {
  message: ChatMessage;
  inProgress?: boolean;
}) {
  const parts = useMemo(() => splitFencedBlocks(message.content), [message.content]);
  return (
    <div className={`chat__msg chat__msg--${message.role}${inProgress ? " chat__msg--streaming" : ""}`}>
      <div className="chat__msg-role">{message.role === "assistant" ? "ai" : message.role}</div>
      <div className="chat__msg-body">
        {parts.map((part, i) =>
          part.kind === "text" ? (
            <div key={i} className="chat__text">{part.text}</div>
          ) : (
            <div key={i} className="chat__code-block">
              <div className="chat__code-bar">
                <span className="chat__code-lang">{part.lang || "code"}</span>
                {part.isQasm && (
                  <span className="chat__open-tab" title="This block was opened as a new tab when the message arrived">
                    auto-opened as new tab
                  </span>
                )}
              </div>
              <pre className="chat__code"><code>{part.text}</code></pre>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Scan a finished assistant message for fenced QASM blocks and open each
 * one as a new tab. Runs once per message, in the streaming onDone path —
 * NOT in the render path — so that reloading the page from persisted
 * history doesn't reopen tabs that were already created in a prior session.
 *
 * Parse failures are logged but otherwise silent: the block stays visible
 * in the chat for the user to copy out manually if they want to repair it.
 */
function autoOpenQasmBlocks(
  full: string,
  onLoadInNewTab: (circuit: Circuit, name?: string) => void,
): void {
  const parts = splitFencedBlocks(full);
  let n = 0;
  for (const part of parts) {
    if (part.kind !== "code" || !part.isQasm) continue;
    n++;
    const result = parseQasm3(part.text);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn(`Quantiom: auto-open skipped a QASM block — parse error on line ${result.line}: ${result.error}`);
      continue;
    }
    onLoadInNewTab(result.circuit, `AI suggestion #${n}`);
  }
}

type Part =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string; lang: string; isQasm: boolean };

/**
 * Split a message into alternating text and fenced-code parts. Fenced
 * blocks are detected by ``` on its own line; the next token on that line
 * (if any) is the language tag. A code block is flagged as QASM when its
 * first non-empty line contains `OPENQASM`, `qubit[`, or `qreg`, OR when
 * the language tag is `qasm` / `openqasm` / `openqasm3`.
 */
function splitFencedBlocks(src: string): Part[] {
  const out: Part[] = [];
  const lines = src.split("\n");
  let i = 0;
  let textBuf: string[] = [];
  const flushText = () => {
    if (textBuf.length > 0) {
      const t = textBuf.join("\n");
      if (t.length > 0) out.push({ kind: "text", text: t });
      textBuf = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```\s*(\S*)\s*$/);
    if (fenceMatch) {
      flushText();
      const lang = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      // Skip the closing fence (or accept an unterminated block at EOF).
      if (i < lines.length) i++;
      const text = codeLines.join("\n");
      const isQasm = isLikelyQasm(lang, text);
      out.push({ kind: "code", text, lang, isQasm });
      continue;
    }
    textBuf.push(line);
    i++;
  }
  flushText();
  return out;
}

function isLikelyQasm(lang: string, body: string): boolean {
  const l = lang.toLowerCase();
  if (l === "qasm" || l === "openqasm" || l === "openqasm3") return true;
  // First non-empty line.
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("//")) continue; // skip comments while sniffing
    return /OPENQASM\b|qubit\s*\[|qreg\s+/i.test(t);
  }
  return false;
}

// ─── Model picker ──────────────────────────────────────────────────────

function ModelPicker({ model, onPick, apiKey }: { model: string; onPick: (id: string) => void; apiKey: string }) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loadingErr, setLoadingErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || models.length > 0) return;
    listModels()
      .then(setModels)
      .catch((e) => setLoadingErr(e instanceof Error ? e.message : String(e)));
  }, [open, models.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models.slice(0, 200);
    return models.filter((m) =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    ).slice(0, 200);
  }, [models, query]);

  void apiKey; // Listed for future per-key filtering (e.g. provider keys).

  return (
    <div className="chat__model" ref={wrapRef}>
      <button className="chat__model-btn" onClick={() => setOpen((o) => !o)} title="Pick a model">
        {model || "pick model"} ▾
      </button>
      {open && (
        <div className="chat__model-pop">
          <input
            className="chat__model-search"
            placeholder={models.length > 0 ? `Search ${models.length} models…` : "loading…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="chat__model-list">
            {loadingErr && <div className="chat__error">✗ {loadingErr}</div>}
            {filtered.map((m) => (
              <button
                key={m.id}
                className={"chat__model-item" + (m.id === model ? " chat__model-item--on" : "")}
                onClick={() => { onPick(m.id); setOpen(false); setQuery(""); }}
                title={m.description}
              >
                <span className="chat__model-name">{m.name}</span>
                <span className="chat__model-id">{m.id}</span>
              </button>
            ))}
            {!loadingErr && models.length > 0 && filtered.length === 0 && (
              <div className="chat__model-none">no matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
