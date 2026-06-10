import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circuit } from "../editor/types";
import { emitQasm3 } from "../qasm/emit";
import { parseQasm3 } from "../qasm/parse";
import { Markdown } from "../editor/Markdown";
import {
  listModels,
  streamChat,
  type ChatMessage,
  type OpenRouterModel,
} from "../sim/openrouter";
import type { SimResult } from "../sim/simulate";
import type { NoiseModel } from "../sim/noise";
import {
  ALL_ATTACH_KEYS,
  ATTACH_LABELS,
  buildAttachedContext,
  type AttachKey,
} from "./chatContext";
import { PROMPT_LIBRARY } from "./promptLibrary";
import { requestCustomPlot, requestCustomPlotProgram } from "./CustomPlotPanel";
import { setPanelCollapsed } from "./PanelShell";
import { coercePlotSpec, plotTitle } from "../sim/plotSpec";
import { chatCompletion, type AgentMessage } from "../sim/openrouter";
import { AGENT_TOOLS, executeTool, type AgentContext } from "./agentTools";
import type { CustomGate } from "../editor/customGates";
import type { ParameterValues } from "../sim/simulate";
import {
  DIALOGUE_PRESETS,
  buildTurnMessages,
  nextSpeakerOf,
  turnsAreConverging,
  dialogueToMarkdown,
  loadDialogue,
  saveDialogue,
  type DialogueConfig,
  type DialogueTurn,
  type Role,
} from "./dialogue";
import {
  loadApiKey, saveApiKey,
  loadModel, saveModel,
  loadHistory, saveHistory,
  loadHeight, saveHeight,
  loadOpen, saveOpen,
  loadAttached, saveAttached,
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
  /** Latest simulator result for the active circuit; null while computing
   *  or when the panel can't derive one (large stabilizer circuits etc.).
   *  Used to populate optional context attachments. */
  simResult: SimResult | null;
  noise: NoiseModel;
  customGates: CustomGate[];
  paramValues: ParameterValues;
  onLoadInNewTab: (circuit: Circuit, name?: string) => void;
  /** Replace the active circuit (undo-able) — used by Agent mode tools. */
  onApplyCircuit: (circuit: Circuit) => void;
  /** Update the noise model — used by the Agent's set_noise tool. */
  onSetNoise: (noise: NoiseModel) => void;
  /** Agent tab/param/custom-gate controls. */
  onListTabs: () => Array<{ index: number; name: string; numQubits: number; active: boolean }>;
  onSwitchTab: (index: number) => boolean;
  onCloseTab: (index: number) => boolean;
  onSaveCustomGate: (circuit: Circuit, name: string) => void;
  onSetParams: (values: ParameterValues) => void;
};

const SYSTEM_PROMPT =
  "You are an assistant integrated into Quantiom, a browser-native " +
  "quantum-circuit editor for researchers already comfortable with quantum " +
  "computing. The user may attach the current circuit as OpenQASM 3 text. " +
  "When proposing a new circuit or modification, always emit it inside a " +
  "fenced code block starting with ```qasm or ```openqasm — Quantiom " +
  "auto-detects those blocks and offers to open them as a new tab. " +
  "When the user asks for a plot, chart, or visualisation of a quantity " +
  "over the current circuit, emit a fenced ```plotspec block containing a " +
  "single JSON object so Quantiom can render it natively (no code runs). " +
  "Schema: {\"quantity\": one of — per qubit: \"expZ\"|\"expX\"|\"expY\"|" +
  "\"qubitEntropy\"|\"purityQubit\"|\"coherenceQubit\"; per basis state: " +
  "\"prob\"|\"amp\"|\"phase\"; 1-D profile: \"entropy\"|\"renyi2\"|" +
  "\"pauliWeight\"; pairwise matrix: \"mutualInfo\"|\"zzCorr\"|\"xxCorr\"|" +
  "\"yyCorr\"|\"negativity\"|\"concurrence\"; single scalar: \"midEntropy\"|" +
  "\"magic\"|\"meyerWallach\"|\"participationEntropy\"|\"l1Coherence\"; " +
  "parameterized (need \"args\"): \"pauli\" (⟨P⟩), \"energy\" (⟨H⟩ Pauli-sum), " +
  "\"schmidt\" (entanglement spectrum at a cut), \"otoc\" (C(t) scrambling — " +
  "its own t-series, chart must be line). \"args\": { \"pauli\": e.g. \"ZIZ\" " +
  "(length n); \"hamiltonian\": e.g. \"ZZ + 0.5 XI\"; \"cut\": integer 1…n−1; " +
  "\"wPauli\"/\"vPauli\" ∈ X/Y/Z with \"wQubit\"/\"vQubit\" indices (otoc) }. " +
  "\"sweep\": \"none\"|\"column\"|\"t\" (\"column\" = vs circuit depth, \"t\" = " +
  "vs the t clock over 0…2π; a sweep is only valid with the per-qubit or the " +
  "scalar quantities — incl. pauli/energy). \"chart\": \"bars\"|\"line\"|" +
  "\"heatmap\" (matrix quantities must use heatmap; a swept quantity must use " +
  "line or heatmap). \"title\": optional string}. Add a one-line explanation " +
  "before the block. " +
  "For a plot the spec catalog can't express, you may instead emit a fenced " +
  "```plotjs block: the BODY of a function (data) => scene that returns a " +
  "declarative scene {width, height, title?, elements:[…]}. It runs in a " +
  "sandboxed Web Worker (no DOM, network, or imports). `data` = {n, dim, " +
  "ampRe[], ampIm[], prob[], numColumns, numClbits, clbits (0/1[] or null), " +
  "counts ({bitstring:count} or null), shots, rho1 (per-qubit 2×2 reduced " +
  "density matrices: rho1[q].re/.im length-4 [ρ00,ρ01,ρ10,ρ11]), width, " +
  "height, palette:{accent,accent2,warm,muted,border}}. Element types: " +
  "{type:'line',x1,y1,x2,y2," +
  "stroke?,strokeWidth?}, {type:'rect',x,y,width,height,fill?,opacity?}, " +
  "{type:'circle',cx,cy,r,fill?}, {type:'path',d,stroke?,fill?}, " +
  "{type:'polyline',points:[[x,y]…],stroke?,fill?}, {type:'text',x,y,text," +
  "fill?,anchor?,size?}. Coordinates are in the width×height space, y down. " +
  "Prefer a ```plotspec block when a catalog quantity fits; use ```plotjs " +
  "only for genuinely custom visuals. " +
  "Write mathematics in LaTeX: inline as $…$ and display as $$…$$ " +
  "(KaTeX renders it, including \\ket{}, \\bra{}, \\braket{}{}). Be " +
  "concise; do not over-explain quantum-computing basics.";

const AGENT_SYSTEM_PROMPT =
  "You are an agent embedded in Quantiom, a browser quantum-circuit editor. " +
  "You can ACT on the app by calling the provided tools: read the circuit and " +
  "its simulated state/resources/expectations, and modify it (set the whole " +
  "circuit from OpenQASM 3, place/remove gates, add qubits, optimise, " +
  "transpile, compile, append the inverse, add plots). Prefer `set_circuit_qasm` " +
  "for building or substantially rewriting circuits, and the incremental tools " +
  "for small edits. Always inspect with read tools (get_resources / get_state / " +
  "expectation / get_analysis / get_free_symbols) to verify your work — these " +
  "return computed numbers you must not fabricate. Call get_free_symbols before " +
  "set_params, and run_benchmark / get_noise for device characterization. Every " +
  "edit is undo-able by the user. Call list_tools if unsure what you can do; " +
  "use insert_snippet for common blocks (Bell/GHZ/QFT/iQFT/Trotter) and set_panel " +
  "to reveal the panel that shows what you computed. When " +
  "done, give a short plain-language summary of what you did and what you found. " +
  "Write math in $…$ / $$…$$ (KaTeX). Be concise.";

const DEFAULT_AGENT_STEPS = 14;

/** Selectable "max out tokens" values, smallest → largest. */
const MAX_TOKEN_CHOICES = [2500, 5000, 10000, 20000, 30000, 40000, 50000];
const DEFAULT_OUT_TOKENS = 5000;
/** Char cost of the agent tool schema — re-sent on every agent step. */
const AGENT_TOOLS_CHARS = JSON.stringify(AGENT_TOOLS).length;
/** Serialized character size of whatever we send to / receive from the model. */
const charsOf = (v: unknown): number => {
  try { return JSON.stringify(v).length; } catch { return 0; }
};
/** Compact char count: 1234 → "1.2k", 1.2e6 → "1.2M". */
const fmtChars = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
/** Token-choice label: 2500 → "2.5k", 5000 → "5k". */
const fmtTokChoice = (v: number): string => `${v % 1000 === 0 ? v / 1000 : (v / 1000).toFixed(1)}k`;

export function ChatPanel({ circuit, simResult, noise, customGates, paramValues, onLoadInNewTab, onApplyCircuit, onSetNoise, onListTabs, onSwitchTab, onCloseTab, onSaveCustomGate, onSetParams }: Props) {
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
  const [showContext, setShowContext] = useState<boolean>(false);
  const [showPrompts, setShowPrompts] = useState<boolean>(false);
  const [attached, setAttached] = useState<Set<AttachKey>>(loadAttached);
  // Reply-pane font scale (1 = 100%), adjustable with −/+. Persisted.
  const [replyScale, setReplyScale] = useState<number>(() => {
    try { const v = parseFloat(localStorage.getItem("quantiom:chat:font-scale") ?? ""); return Number.isFinite(v) && v >= 0.6 && v <= 2 ? v : 1; } catch { return 1; }
  });
  // Max completion tokens per request. Bounds OpenRouter's up-front credit
  // reservation (a missing/huge value 402s low-limit keys). Chosen from a fixed
  // set in the second header row. Persisted.
  const [maxTokens, setMaxTokens] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem("quantiom:chat:max-tokens") ?? "", 10); return MAX_TOKEN_CHOICES.includes(v) ? v : DEFAULT_OUT_TOKENS; } catch { return DEFAULT_OUT_TOKENS; }
  });
  useEffect(() => { try { localStorage.setItem("quantiom:chat:max-tokens", String(maxTokens)); } catch { /* ignore */ } }, [maxTokens]);
  // Running input / output character counters for this conversation. Reset to 0
  // by Clear. Not persisted (session-scoped cost meter).
  const [usageIn, setUsageIn] = useState<number>(0);
  const [usageOut, setUsageOut] = useState<number>(0);
  // AI ↔ AI dialogue mode + Agent (tool-use) mode.
  const [mode, setMode] = useState<"chat" | "dialogue" | "agent">("chat");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentRunning, setAgentRunning] = useState<boolean>(false);
  const agentMsgsRef = useRef<AgentMessage[]>([]);
  const agentAbortRef = useRef<AbortController | null>(null);
  // Max tool-use steps per agent run (bounds cost/runaway loops). Settable in
  // the header, persisted. Clamped to [1, 100].
  const [maxAgentSteps, setMaxAgentSteps] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem("quantiom:chat:agent-steps") ?? "", 10); return Number.isFinite(v) && v >= 1 && v <= 100 ? v : DEFAULT_AGENT_STEPS; } catch { return DEFAULT_AGENT_STEPS; }
  });
  useEffect(() => { try { localStorage.setItem("quantiom:chat:agent-steps", String(maxAgentSteps)); } catch { /* ignore */ } }, [maxAgentSteps]);
  const setAgentSteps = useCallback((n: number) => setMaxAgentSteps(Math.max(1, Math.min(100, Math.round(n || 0) || DEFAULT_AGENT_STEPS))), []);
  const bumpSteps = useCallback((d: number) => setMaxAgentSteps((p) => Math.max(1, Math.min(100, p + d))), []);
  const [dialogueCfg, setDialogueCfg] = useState<DialogueConfig>(loadDialogue);
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [dialogueBuf, setDialogueBuf] = useState<DialogueTurn | null>(null);
  const [dialogueRunning, setDialogueRunning] = useState<boolean>(false);
  const [dialogueProgress, setDialogueProgress] = useState<{ i: number; n: number } | null>(null);
  const [showRoles, setShowRoles] = useState<boolean>(false);
  const dialogueAbortRef = useRef<boolean>(false);
  const topicRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  // Streaming throttle: tokens accumulate in a ref and flush to React state at
  // ~12 fps, so a fast/long reply doesn't trigger a render per token (which,
  // with the markdown/KaTeX pass, can lock the main thread). The in-progress
  // bubble renders plain text; the final message re-renders as markdown.
  const streamAccumRef = useRef<string>("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleFlush = useCallback((flush: () => void) => {
    if (flushTimerRef.current != null) return; // a flush is already pending
    flushTimerRef.current = setTimeout(() => { flushTimerRef.current = null; flush(); }, 80);
  }, []);
  const cancelFlush = useCallback(() => {
    if (flushTimerRef.current != null) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Insert a library prompt into the input for review/editing (does not send).
  // Appends below existing text rather than clobbering anything typed.
  const insertPrompt = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text));
    setShowPrompts(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => { saveOpen(open); }, [open]);
  useEffect(() => { saveHeight(height); }, [height]);
  useEffect(() => { saveApiKey(apiKey); }, [apiKey]);
  useEffect(() => { saveModel(model); }, [model]);
  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { saveAttached(attached); }, [attached]);
  useEffect(() => { saveDialogue(dialogueCfg); }, [dialogueCfg]);
  useEffect(() => { try { localStorage.setItem("quantiom:chat:font-scale", String(replyScale)); } catch { /* ignore */ } }, [replyScale]);
  const adjustScale = useCallback((d: number) => {
    setReplyScale((s) => Math.round(Math.min(2, Math.max(0.6, s + d)) * 100) / 100);
  }, []);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history, streamBuf, open, dialogue, dialogueBuf, agentMessages]);

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
    const extra = buildAttachedContext(attached, circuit, simResult, noise);
    const userContent =
      `Current circuit (OpenQASM 3, ${circuit.numQubits} qubits, ` +
      `${circuit.gates.length} gates):\n\n\`\`\`qasm\n${qasm}\n\`\`\`` +
      (extra ? `\n\nAdditional Quantiom-computed context:\n\n${extra}` : "") +
      `\n\nUser message:\n${text}`;

    const userMsg: ChatMessage = { role: "user", content: userContent };
    const msgs: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      userMsg,
    ];
    // Show only the user's actual text (without attached QASM) in history.
    const visibleUser: ChatMessage = { role: "user", content: text };
    setHistory((h) => [...h, visibleUser]);
    setUsageIn((n) => n + charsOf(msgs));
    setInput("");
    setStreaming(true);
    setStreamBuf("");
    streamAccumRef.current = "";

    abortRef.current = streamChat(apiKey, model, msgs, {
      onDelta: (chunk) => {
        streamAccumRef.current += chunk;
        scheduleFlush(() => setStreamBuf(streamAccumRef.current));
      },
      onDone: (full) => {
        cancelFlush();
        setStreaming(false);
        abortRef.current = null;
        setUsageOut((n) => n + full.length);
        if (full.length > 0) setHistory((h) => [...h, { role: "assistant", content: full }]);
        setStreamBuf("");
        streamAccumRef.current = "";
        // Auto-open every detected QASM block as a new tab. Done here
        // (not in render) so reloading the page from history doesn't
        // re-open already-shown circuits.
        autoOpenQasmBlocks(full, onLoadInNewTab);
      },
      onError: (msg) => {
        cancelFlush();
        setStreaming(false);
        abortRef.current = null;
        setError(msg);
        setStreamBuf("");
        streamAccumRef.current = "";
      },
    }, maxTokens);
  }, [input, streaming, apiKey, model, circuit, history, onLoadInNewTab, attached, simResult, noise, maxTokens, scheduleFlush, cancelFlush]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    agentAbortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    if (streaming || dialogueRunning || agentRunning) return;
    if (mode === "dialogue") { setDialogue([]); setDialogueBuf(null); }
    else if (mode === "agent") { setAgentMessages([]); agentMsgsRef.current = []; }
    else { setHistory([]); setStreamBuf(""); }
    setUsageIn(0); setUsageOut(0);
    setError(null);
  }, [streaming, dialogueRunning, agentRunning, mode]);

  // ── Agent mode: tool-use loop ─────────────────────────────────────
  const runAgent = useCallback(async () => {
    const text = input.trim();
    if (!text || agentRunning) return;
    if (!apiKey) { setError("Set your OpenRouter API key (Settings)"); return; }
    if (!model) { setError("Pick a model (Settings)"); return; }
    setError(null);
    setInput("");

    const qasm = emitQasm3(circuit);
    const userMsg: AgentMessage = {
      role: "user",
      content: `${text}\n\nCurrent circuit (OpenQASM 3):\n\`\`\`qasm\n${qasm}\n\`\`\``,
    };
    const base: AgentMessage[] = agentMsgsRef.current.length
      ? agentMsgsRef.current
      : [{ role: "system", content: AGENT_SYSTEM_PROMPT }];
    let msgs: AgentMessage[] = [...base, userMsg];
    setAgentMessages(msgs);
    setAgentRunning(true);
    const abort = new AbortController();
    agentAbortRef.current = abort;

    // The agent's working circuit + params — kept in sync within the loop (the
    // `circuit`/`paramValues` props are stale inside this async closure until
    // React re-renders, so reads after a mutation must see the local copies).
    let working = circuit;
    let workingParams: ParameterValues = { ...paramValues };
    const ctx: AgentContext = {
      getCircuit: () => working,
      customGates,
      paramValues: workingParams,
      coupling: noise.coupling,
      applyCircuit: (next) => { working = next; onApplyCircuit(next); },
      addPlot: (spec) => { requestCustomPlot(spec); },
      openInNewTab: onLoadInNewTab,
      noise,
      setNoise: onSetNoise,
      listTabs: onListTabs,
      switchTab: onSwitchTab,
      closeTab: onCloseTab,
      saveCustomGate: onSaveCustomGate,
      setParams: (vals) => { workingParams = { ...workingParams, ...vals }; ctx.paramValues = workingParams; onSetParams(workingParams); },
      addPlotProgram: (code) => { requestCustomPlotProgram(code); },
      setPanel: (id, open) => { setPanelCollapsed(id, !open); },
    };

    try {
      for (let step = 0; step < maxAgentSteps; step++) {
        // Input this step = the whole replayed transcript + the tool schema.
        setUsageIn((n) => n + charsOf(msgs) + AGENT_TOOLS_CHARS);
        const { content, toolCalls } = await chatCompletion(apiKey, model, msgs, AGENT_TOOLS, abort.signal, maxTokens);
        setUsageOut((n) => n + (content?.length ?? 0) + charsOf(toolCalls));
        if (toolCalls.length === 0) {
          msgs = [...msgs, { role: "assistant", content: content || "(done)" }];
          setAgentMessages(msgs);
          break;
        }
        msgs = [...msgs, { role: "assistant", content: content || null, tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) }];
        setAgentMessages(msgs);
        for (const call of toolCalls) {
          let result: string;
          try {
            const a = call.arguments ? JSON.parse(call.arguments) : {};
            result = executeTool(call.name, a, ctx);
          } catch (e) {
            result = `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
          msgs = [...msgs, { role: "tool", tool_call_id: call.id, name: call.name, content: result }];
          setAgentMessages(msgs);
        }
        if (step === maxAgentSteps - 1) {
          msgs = [...msgs, { role: "assistant", content: `(reached the ${maxAgentSteps}-step tool limit — raise “steps” in the header to let it continue)` }];
          setAgentMessages(msgs);
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      agentMsgsRef.current = msgs;
      setAgentRunning(false);
      agentAbortRef.current = null;
    }
  }, [input, agentRunning, apiKey, model, circuit, customGates, paramValues, noise, maxAgentSteps, maxTokens, onApplyCircuit, onLoadInNewTab, onSetNoise, onListTabs, onSwitchTab, onSaveCustomGate, onSetParams]);

  // Snapshot the current circuit + attached panels as the grounding context
  // shared by every dialogue turn (the circuit is fixed during a run).
  const buildContextBlock = useCallback(() => {
    const qasm = emitQasm3(circuit);
    const extra = buildAttachedContext(attached, circuit, simResult, noise);
    return (
      `Current circuit (OpenQASM 3, ${circuit.numQubits} qubits, ` +
      `${circuit.gates.length} gates):\n\n\`\`\`qasm\n${qasm}\n\`\`\`` +
      (extra ? `\n\nAdditional Quantiom-computed context:\n\n${extra}` : "")
    );
  }, [circuit, attached, simResult, noise]);

  // Run one turn as a promise around the streaming API.
  const runTurn = useCallback(
    (role: Role, msgs: ChatMessage[], onDelta: (c: string) => void): Promise<string | null> =>
      new Promise((resolve) => {
        setUsageIn((n) => n + charsOf(msgs));
        abortRef.current = streamChat(apiKey, role.model, msgs, {
          onDelta,
          onDone: (full) => { abortRef.current = null; setUsageOut((n) => n + full.length); resolve(full); },
          onError: (m) => { abortRef.current = null; setError(m); resolve(null); },
        }, maxTokens);
      }),
    [apiKey, maxTokens],
  );

  // Launch (or, when a transcript already exists, continue) the AI ↔ AI
  // dialogue. The input box seeds the topic, or injects a human turn when
  // continuing ("jump in").
  const runDialogue = useCallback(() => {
    if (dialogueRunning || streaming) return;
    if (!apiKey) { setError("Set your OpenRouter API key (Settings)"); return; }
    const { roleA, roleB, maxTurns } = dialogueCfg;
    if (!roleA.model || !roleB.model) { setError("Pick a model for each role (roles)"); return; }
    const text = input.trim();
    const fresh = dialogue.length === 0;
    if (fresh && !text) { setError("Enter a discussion topic to start"); return; }
    setError(null);

    const contextBlock = buildContextBlock();
    // Topic = the original seed for a fresh run; for a continue we reuse the
    // first turn's framing and add the human line as an interjection.
    const seed = fresh ? text : (topicRef.current || "Continue the discussion.");
    if (fresh) topicRef.current = text;
    const startTranscript: DialogueTurn[] = fresh ? [] : [...dialogue];
    if (!fresh && text) startTranscript.push({ speaker: "user", name: "User", content: text });

    if (fresh) setDialogue([]);
    else if (text) setDialogue(startTranscript);
    setInput("");
    setDialogueRunning(true);
    dialogueAbortRef.current = false;

    (async () => {
      const transcript: DialogueTurn[] = [...startTranscript];
      let speaker = nextSpeakerOf(transcript);
      for (let t = 0; t < maxTurns; t++) {
        if (dialogueAbortRef.current) break;
        setDialogueProgress({ i: t + 1, n: maxTurns });
        const role = speaker === "A" ? roleA : roleB;
        const msgs = buildTurnMessages(speaker, { roleA, roleB }, contextBlock, seed, transcript);
        setDialogueBuf({ speaker, name: role.name, content: "" });
        streamAccumRef.current = "";
        const full = await runTurn(role, msgs, (chunk) => {
          streamAccumRef.current += chunk;
          scheduleFlush(() => setDialogueBuf({ speaker, name: role.name, content: streamAccumRef.current }));
        });
        cancelFlush();
        streamAccumRef.current = "";
        setDialogueBuf(null);
        if (full == null) break; // error already surfaced
        const turn: DialogueTurn = { speaker, name: role.name, content: full };
        const prev = transcript[transcript.length - 1];
        transcript.push(turn);
        setDialogue((d) => [...d, turn]);
        if (full.trim() === "") break;
        // Cost guard: stop early if the two sides have converged (near-verbatim
        // echo) rather than paying for the rest of the turn cap.
        if (prev && prev.speaker !== "user" && turnsAreConverging(full, prev.content)) {
          setDialogue((d) => [...d, { speaker: "user", name: "system", content: "— discussion converged; stopped early to save tokens. Edit the topic or jump in to continue." }]);
          break;
        }
        if (dialogueAbortRef.current) break;
        speaker = speaker === "A" ? "B" : "A";
      }
      setDialogueRunning(false);
      setDialogueProgress(null);
    })();
  }, [dialogueRunning, streaming, apiKey, dialogueCfg, input, dialogue, buildContextBlock, runTurn, scheduleFlush, cancelFlush]);

  const stopDialogue = useCallback(() => {
    dialogueAbortRef.current = true;
    abortRef.current?.abort();
  }, []);

  // Download the dialogue transcript as a Markdown file.
  const exportDialogue = useCallback(() => {
    if (dialogue.length === 0) return;
    const md = dialogueToMarkdown(dialogue, {
      roleA: dialogueCfg.roleA,
      roleB: dialogueCfg.roleB,
      topic: topicRef.current,
      circuitName: circuit.name,
      qasm: emitQasm3(circuit),
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (circuit.name ?? "circuit").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "circuit";
    a.href = url;
    a.download = `quantiom-dialogue-${slug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [dialogue, dialogueCfg, circuit]);

  // Drag handle for the chat's own height. The chat is the bottom row of the
  // editor; the canvas-row above (1fr) absorbs the change, so growing the chat
  // shrinks the circuit + Inspector area. Driven imperatively during the drag
  // (committed to React state on mouse-up) to avoid a one-frame jitter.
  const onResizeStart = useCallback((startEvent: React.MouseEvent) => {
    startEvent.preventDefault();
    const startY = startEvent.clientY;
    const startChat = height;
    const MIN_CHAT = 120, MAX_CHAT = 800;
    let lastChat = startChat;
    const onMove = (e: MouseEvent) => {
      let d = startY - e.clientY; // drag up → chat grows
      d = Math.min(d, MAX_CHAT - startChat);
      d = Math.max(d, MIN_CHAT - startChat);
      lastChat = startChat + d;
      if (chatRef.current) chatRef.current.style.height = `${lastChat}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setHeight(lastChat); // commit once (keeps React state + saveHeight in sync)
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height]);


  // Collapsed strip: a thin always-visible bar at the bottom.
  if (!open) {
    return (
      <div className="chat chat--collapsed">
        <button className="chat__toggle" onClick={() => setOpen(true)} title="Open AI Assistant">
          ▴ AI Assistant
        </button>
      </div>
    );
  }

  return (
    <div className="chat" style={{ height }} ref={chatRef}>
      <div className="chat__resize" onMouseDown={onResizeStart} title="Drag to resize" />
      <div className="chat__header">
        <button className="chat__toggle" onClick={() => setOpen(false)} title="Hide chat">▾</button>
        <span className="chat__title">AI Assistant</span>
        <div className="chat__mode" role="tablist">
          <button
            className={`chat__mode-btn${mode === "chat" ? " chat__mode-btn--on" : ""}`}
            onClick={() => setMode("chat")}
            title="One-on-one chat with the assistant"
          >chat</button>
          <button
            className={`chat__mode-btn${mode === "dialogue" ? " chat__mode-btn--on" : ""}`}
            onClick={() => setMode("dialogue")}
            title="Watch two AIs discuss your circuit"
          >dialogue</button>
          <button
            className={`chat__mode-btn${mode === "agent" ? " chat__mode-btn--on" : ""}`}
            onClick={() => setMode("agent")}
            title="Let the AI act on Quantiom via tools (read + edit the circuit). Every edit is undo-able."
          >agent</button>
        </div>
        {mode === "dialogue"
          ? <RolesPicker cfg={dialogueCfg} onChange={setDialogueCfg} apiKey={apiKey} open={showRoles} onToggle={() => setShowRoles((s) => !s)} />
          : <ModelPicker model={model} onPick={setModel} apiKey={apiKey} />}
        <ContextPicker
          attached={attached}
          onChange={setAttached}
          open={showContext}
          onToggle={() => setShowContext((s) => !s)}
        />
        <PromptPicker
          open={showPrompts}
          onToggle={() => setShowPrompts((s) => !s)}
          onPick={insertPrompt}
        />
        <button className="chat__btn" onClick={() => setShowSettings((s) => !s)} title="API key & options">
          ⚙
        </button>
        <span className="chat__fontsize" title="Reply text size">
          <button className="chat__btn chat__fontsize-btn" onClick={() => adjustScale(-0.1)} disabled={replyScale <= 0.6} aria-label="Decrease reply text size">−</button>
          <button className="chat__fontsize-pct" onClick={() => setReplyScale(1)} title="Reset to 100%">{Math.round(replyScale * 100)}%</button>
          <button className="chat__btn chat__fontsize-btn" onClick={() => adjustScale(0.1)} disabled={replyScale >= 2} aria-label="Increase reply text size">+</button>
        </span>
        {mode === "dialogue" && (
          <button
            className="chat__btn"
            onClick={exportDialogue}
            disabled={dialogueRunning || dialogue.length === 0}
            title="Download this dialogue as Markdown"
          >
            export
          </button>
        )}
        <button
          className="chat__btn"
          onClick={clearChat}
          disabled={
            streaming || dialogueRunning || agentRunning ||
            (mode === "chat" ? history.length === 0
              : mode === "agent" ? agentMessages.length === 0
              : dialogue.length === 0)
          }
          title={mode === "chat" ? "Clear chat history" : mode === "agent" ? "Clear the agent conversation" : "Clear the dialogue"}
        >
          clear
        </button>
        <span className="chat__tagline">
          {mode === "chat"
            ? "Analyze, create, optimize and transform circuits."
            : "Two AIs discuss your circuit — grounded in the simulator."}
        </span>
      </div>
      <div className="chat__header chat__header2">
        <span className="chat__usage" title="Characters sent to the model this conversation (the running input cost). Resets on Clear.">
          in <b>{fmtChars(usageIn)}</b>
        </span>
        <span className="chat__usage" title="Characters received from the model this conversation (the running output). Resets on Clear.">
          out <b>{fmtChars(usageOut)}</b>
        </span>
        <span className="chat__row2-spacer" />
        {mode === "agent" && (
          <span className="chat__steps" title="Maximum tool-use steps the agent may take in one run before stopping. Raise it for long multi-step tasks; lower it to cap cost.">
            <button className="chat__btn chat__steps-btn" onClick={() => bumpSteps(-1)} disabled={maxAgentSteps <= 1} aria-label="Fewer agent steps">−</button>
            <input
              className="chat__steps-input"
              type="number"
              min={1}
              max={100}
              value={maxAgentSteps}
              onChange={(e) => setAgentSteps(parseInt(e.target.value, 10))}
              aria-label="Maximum agent tool-use steps"
            />
            <span className="chat__steps-label">max steps</span>
            <button className="chat__btn chat__steps-btn" onClick={() => bumpSteps(1)} disabled={maxAgentSteps >= 100} aria-label="More agent steps">+</button>
          </span>
        )}
        <label className="chat__maxtok" title="Maximum output tokens per reply. Lower it if OpenRouter returns a 402 (“requires more credits”).">
          <span className="chat__steps-label">max out tokens</span>
          <select className="chat__maxtok-select" value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}>
            {MAX_TOKEN_CHOICES.map((v) => <option key={v} value={v}>{fmtTokChoice(v)}</option>)}
          </select>
        </label>
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
      <div className="chat__messages" ref={scrollRef} style={{ "--chat-scale": replyScale } as React.CSSProperties}>
        {mode === "agent" ? (
          <>
            {agentMessages.length === 0 && (
              <div className="chat__empty">
                Tell the AI what to do and it will <b>act on Quantiom</b> — read the
                state and build / edit / optimise / transpile the circuit via tools.
                Every change is undo-able (⌘Z). Try “build a 6-qubit Trotterized
                transverse-field Ising quench with a time parameter <code>t</code>,
                then open the space-time entropy panel” — press play on the
                <code>t</code> slider to watch the entanglement light-cone spread.
              </div>
            )}
            {agentMessages.map((m, i) => <AgentMessageView key={i} message={m} />)}
            {agentRunning && <div className="chat__agent-running">working…</div>}
          </>
        ) : mode === "chat" ? (
          <>
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
          </>
        ) : (
          <>
            {dialogue.length === 0 && !dialogueBuf && (
              <div className="chat__empty">
                Seed a topic below and watch <b>{dialogueCfg.roleA.name}</b> and{" "}
                <b>{dialogueCfg.roleB.name}</b> discuss this circuit, turn by turn.
                Set their roles &amp; models via <b>roles</b>; stop or jump in any time.
              </div>
            )}
            {dialogue.map((t, i) => (
              <DialogueTurnView key={i} turn={t} onLoadInNewTab={onLoadInNewTab} />
            ))}
            {dialogueBuf && <DialogueTurnView turn={dialogueBuf} onLoadInNewTab={onLoadInNewTab} inProgress />}
          </>
        )}
        {error && <div className="chat__error">✗ {error}</div>}
      </div>
      <div className="chat__input-row">
        <textarea
          className="chat__input"
          ref={inputRef}
          value={input}
          placeholder={
            mode === "dialogue"
              ? (dialogueRunning
                  ? "running…"
                  : dialogue.length === 0
                    ? "Discussion topic for the two AIs (Enter to start)"
                    : "Optional: jump in with a message, then continue (Enter)")
              : mode === "agent"
                ? (agentRunning ? "working…" : "Tell the AI what to build or change (Enter) — it acts via tools")
                : (streaming ? "streaming…" : "Message (Enter to send · Shift+Enter for newline)")
          }
          rows={2}
          spellCheck={false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline; ⌘/Ctrl+Enter still
            // sends too so muscle memory from the old binding keeps working.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (mode === "dialogue") runDialogue(); else if (mode === "agent") runAgent(); else send();
            }
          }}
          disabled={streaming || dialogueRunning || agentRunning}
        />
        {mode === "agent" ? (
          agentRunning ? (
            <button className="chat__send" onClick={stop} title="Stop the agent">stop</button>
          ) : (
            <button className="chat__send" onClick={runAgent} disabled={!input.trim()} title="Run the agent (Enter)">act</button>
          )
        ) : mode === "dialogue" ? (
          dialogueRunning ? (
            <>
              {dialogueProgress && <span className="chat__turn-count">turn {dialogueProgress.i}/{dialogueProgress.n}</span>}
              <button className="chat__send" onClick={stopDialogue} title="Stop the dialogue">stop</button>
            </>
          ) : (
            <button className="chat__send" onClick={runDialogue} title="Run the AI dialogue (Enter)">
              {dialogue.length === 0 ? "run" : "continue"}
            </button>
          )
        ) : streaming ? (
          <button className="chat__send" onClick={stop} title="Stop streaming">stop</button>
        ) : (
          <button className="chat__send" onClick={send} disabled={!input.trim()} title="Send (⌘/Ctrl+Enter)">
            ask
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Agent (tool-use) message rendering ───────────────────────────────

function prettyArgs(s: string): string {
  try {
    const o = JSON.parse(s);
    const parts = Object.entries(o).map(([k, v]) => `${k}=${typeof v === "string" ? (v.length > 30 ? v.slice(0, 30) + "…" : v) : JSON.stringify(v)}`);
    const j = parts.join(", ");
    return j ? `(${j.length > 90 ? j.slice(0, 90) + "…" : j})` : "()";
  } catch {
    return "()";
  }
}

function AgentMessageView({ message }: { message: AgentMessage }) {
  if (message.role === "system") return null;
  if (message.role === "user") {
    const text = (message.content ?? "").split("\n\nCurrent circuit (OpenQASM 3):")[0];
    return (
      <div className="chat__msg chat__msg--user">
        <div className="chat__msg-role">you</div>
        <div className="chat__msg-body"><div className="chat__text">{text}</div></div>
      </div>
    );
  }
  if (message.role === "tool") {
    const isErr = (message.content ?? "").startsWith("Error:");
    return (
      <div className={`chat__tool-result${isErr ? " chat__tool-result--err" : ""}`}>
        <span className="chat__tool-name">{message.name}</span>
        <pre className="chat__tool-out">{message.content}</pre>
      </div>
    );
  }
  // assistant
  if (message.tool_calls && message.tool_calls.length) {
    return (
      <div className="chat__agent-step">
        {message.content ? <div className="chat__md"><Markdown source={message.content} /></div> : null}
        {message.tool_calls.map((c, i) => (
          <div key={i} className="chat__tool-call">
            <span className="chat__tool-arrow">→</span> <b>{c.function.name}</b>
            <span className="chat__tool-args">{prettyArgs(c.function.arguments)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <Message message={{ role: "assistant", content: message.content ?? "" }} />;
}

// ─── Message rendering with QASM-block detection ───────────────────────

function Message({
  message,
  inProgress,
}: {
  message: ChatMessage;
  inProgress?: boolean;
}) {
  const parts = useMemo(() => (inProgress ? [] : splitFencedBlocks(message.content)), [message.content, inProgress]);
  return (
    <div className={`chat__msg chat__msg--${message.role}${inProgress ? " chat__msg--streaming" : ""}`}>
      <div className="chat__msg-role">{message.role === "assistant" ? "ai" : message.role}</div>
      <div className="chat__msg-body">
        {/* While streaming, render plain text — markdown/KaTeX re-parsing on
            every token (and on partial $$…$$) can lock the main thread. The
            finished message re-renders as markdown below. */}
        {inProgress && <div className="chat__text">{message.content}</div>}
        {parts.map((part, i) =>
          part.kind === "text" ? (
            message.role === "assistant" ? (
              <div key={i} className="chat__md"><Markdown source={part.text} /></div>
            ) : (
              <div key={i} className="chat__text">{part.text}</div>
            )
          ) : part.isPlotSpec ? (
            <PlotSpecBlock key={i} text={part.text} />
          ) : part.isPlotProgram ? (
            <PlotProgramBlock key={i} text={part.text} />
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

// ─── Dialogue turn rendering ───────────────────────────────────────────

function DialogueTurnView({
  turn,
  onLoadInNewTab,
  inProgress,
}: {
  turn: DialogueTurn;
  onLoadInNewTab: (circuit: Circuit, name?: string) => void;
  inProgress?: boolean;
}) {
  const parts = useMemo(() => (inProgress ? [] : splitFencedBlocks(turn.content)), [turn.content, inProgress]);
  const openQasm = (text: string) => {
    const result = parseQasm3(text);
    if (result.ok) onLoadInNewTab(result.circuit, turn.name);
  };
  return (
    <div className={`chat__turn chat__turn--${turn.speaker}${inProgress ? " chat__msg--streaming" : ""}`}>
      <div className="chat__turn-name">{turn.name}</div>
      <div className="chat__msg-body">
        {/* Plain text while streaming (markdown/KaTeX per token can freeze). */}
        {inProgress && <div className="chat__text">{turn.content}</div>}
        {parts.map((part, i) =>
          part.kind === "text" ? (
            turn.speaker === "user" ? (
              <div key={i} className="chat__text">{part.text}</div>
            ) : (
              <div key={i} className="chat__md"><Markdown source={part.text} /></div>
            )
          ) : part.isPlotSpec ? (
            <PlotSpecBlock key={i} text={part.text} />
          ) : part.isPlotProgram ? (
            <PlotProgramBlock key={i} text={part.text} />
          ) : (
            <div key={i} className="chat__code-block">
              <div className="chat__code-bar">
                <span className="chat__code-lang">{part.lang || "code"}</span>
                {part.isQasm && (
                  <button className="chat__open-tab chat__open-tab--btn" onClick={() => openQasm(part.text)} title="Parse this circuit into a new tab">
                    open as new tab
                  </button>
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

/**
 * Render an AI-emitted ```plotspec block as a one-click "add plot" action.
 * The JSON is coerced through `requestCustomPlot` (which validates + repairs);
 * an invalid spec falls back to showing the raw block so the user can read it.
 */
function PlotSpecBlock({ text }: { text: string }) {
  const [added, setAdded] = useState(false);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const add = () => {
    const spec = requestCustomPlot(parsed);
    if (spec) setAdded(true);
  };
  // Preview title without mutating anything.
  const coerced = coercePlotSpec(parsed);
  const title = coerced ? plotTitle(coerced) : null;
  return (
    <div className="chat__code-block chat__plotspec">
      <div className="chat__code-bar">
        <span className="chat__code-lang">plot{title ? `: ${title}` : ""}</span>
        {title ? (
          <button
            className="chat__open-tab chat__open-tab--btn"
            onClick={add}
            disabled={added}
            title="Add this plot to the Custom plots panel"
          >
            {added ? "✓ added to Custom plots" : "+ add plot"}
          </button>
        ) : (
          <span className="chat__open-tab">invalid plot spec</span>
        )}
      </div>
      <pre className="chat__code"><code>{text}</code></pre>
    </div>
  );
}

/** Render an AI-emitted ```plotjs block as a one-click "add plot" action that
 *  adds a sandboxed code plot to the Custom plots panel. */
function PlotProgramBlock({ text }: { text: string }) {
  const [added, setAdded] = useState(false);
  const add = () => { if (requestCustomPlotProgram(text)) setAdded(true); };
  return (
    <div className="chat__code-block chat__plotspec">
      <div className="chat__code-bar">
        <span className="chat__code-lang">plot code (sandboxed)</span>
        <button
          className="chat__open-tab chat__open-tab--btn"
          onClick={add}
          disabled={added}
          title="Add this code plot to the Custom plots panel (runs in a sandbox)"
        >
          {added ? "✓ added to Custom plots" : "+ add plot"}
        </button>
      </div>
      <pre className="chat__code"><code>{text}</code></pre>
    </div>
  );
}

type Part =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string; lang: string; isQasm: boolean; isPlotSpec: boolean; isPlotProgram: boolean };

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
      const isPlotProgram = /^(plotjs|plotcode)$/i.test(lang.trim());
      const isPlotSpec = !isPlotProgram && /^(plotspec|plot)$/i.test(lang.trim());
      out.push({ kind: "code", text, lang, isQasm, isPlotSpec, isPlotProgram });
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

// ─── Context-attach picker ─────────────────────────────────────────────

/**
 * Popover with one checkbox per attachable Quantiom-computed quantity.
 * Selected items get serialised by `buildAttachedContext` and spliced
 * into the user message above the typed text. Selection persists across
 * sessions; the button label shows a live count so users know what
 * they're sending.
 */
function ContextPicker({
  attached,
  onChange,
  open,
  onToggle,
}: {
  attached: ReadonlySet<AttachKey>;
  onChange: (next: Set<AttachKey>) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);

  const toggle = (k: AttachKey) => {
    const next = new Set(attached);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };

  const count = attached.size;
  return (
    <div className="chat__context" ref={wrapRef}>
      <button
        className="chat__btn"
        onClick={onToggle}
        title="Pick extra Quantiom-computed context to attach to your next message"
      >
        + context{count > 0 ? ` (${count})` : ""}
      </button>
      {open && (
        <div className="chat__context-pop">
          <div className="chat__context-head">attach to every message</div>
          {ALL_ATTACH_KEYS.map((k) => (
            <label key={k} className="chat__context-row">
              <input
                type="checkbox"
                checked={attached.has(k)}
                onChange={() => toggle(k)}
              />
              <span>{ATTACH_LABELS[k]}</span>
            </label>
          ))}
          <div className="chat__context-note">
            Each adds a short pre-serialised block above your prompt.
            Distributions cap at the top 64 entries by probability.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Prompt library picker ─────────────────────────────────────────────

function PromptPicker({
  open,
  onToggle,
  onPick,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (text: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);

  const q = query.trim().toLowerCase();
  const categories = useMemo(() => {
    if (!q) return PROMPT_LIBRARY;
    return PROMPT_LIBRARY
      .map((c) => ({
        ...c,
        prompts: c.prompts.filter(
          (p) => p.title.toLowerCase().includes(q) || p.text.toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.prompts.length > 0);
  }, [q]);

  return (
    <div className="chat__prompts" ref={wrapRef}>
      <button
        className="chat__btn"
        onClick={onToggle}
        title="Insert a ready-made prompt into the message box (you can edit it before sending)"
      >
        prompts
      </button>
      {open && (
        <div className="chat__prompts-pop">
          <input
            className="chat__prompts-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter prompts…"
            autoFocus
            spellCheck={false}
          />
          <div className="chat__prompts-list">
            {categories.map((c) => (
              <div key={c.name} className="chat__prompts-cat">
                <div className="chat__prompts-cathead">{c.name}</div>
                {c.prompts.map((p) => (
                  <button
                    key={p.title}
                    className="chat__prompts-item"
                    onClick={() => onPick(p.text)}
                    title={p.text}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            ))}
            {categories.length === 0 && <div className="chat__prompts-empty">No matching prompts.</div>}
          </div>
          <div className="chat__prompts-note">
            Inserts into the message box for editing — bracketed [values] are
            placeholders to fill in. Your circuit is attached automatically.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dialogue roles picker ─────────────────────────────────────────────

function RolesPicker({
  cfg,
  onChange,
  apiKey,
  open,
  onToggle,
}: {
  cfg: DialogueConfig;
  onChange: (next: DialogueConfig) => void;
  apiKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onToggle]);

  const setRole = (which: "roleA" | "roleB", patch: Partial<Role>) =>
    onChange({ ...cfg, [which]: { ...cfg[which], ...patch } });
  const applyPreset = (idx: number) => {
    const p = DIALOGUE_PRESETS[idx];
    if (!p) return;
    onChange({
      ...cfg,
      roleA: { ...cfg.roleA, name: p.a.name, persona: p.a.persona },
      roleB: { ...cfg.roleB, name: p.b.name, persona: p.b.persona },
    });
  };

  const roleEditor = (which: "roleA" | "roleB", label: string) => {
    const r = cfg[which];
    return (
      <div className="chat__role">
        <div className="chat__role-head">{label}</div>
        <input
          className="chat__role-name"
          value={r.name}
          onChange={(e) => setRole(which, { name: e.target.value })}
          placeholder="name"
          spellCheck={false}
        />
        <ModelPicker model={r.model} onPick={(id) => setRole(which, { model: id })} apiKey={apiKey} />
        <textarea
          className="chat__role-persona"
          value={r.persona}
          onChange={(e) => setRole(which, { persona: e.target.value })}
          placeholder="persona / instructions"
          rows={3}
          spellCheck={false}
        />
      </div>
    );
  };

  return (
    <div className="chat__roles" ref={wrapRef}>
      <button className="chat__btn" onClick={onToggle} title="Configure the two AI roles, models, and turn count">
        roles
      </button>
      {open && (
        <div className="chat__roles-pop">
          <div className="chat__roles-row">
            <label className="chat__roles-label">Preset</label>
            <select
              className="rb__mode"
              defaultValue=""
              onChange={(e) => { if (e.target.value !== "") applyPreset(Number(e.target.value)); e.target.value = ""; }}
            >
              <option value="">choose…</option>
              {DIALOGUE_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
            <label className="chat__roles-label">Turns</label>
            <select
              className="rb__mode"
              value={cfg.maxTurns}
              onChange={(e) => onChange({ ...cfg, maxTurns: Number(e.target.value) })}
            >
              {[2, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {roleEditor("roleA", "Role A")}
          {roleEditor("roleB", "Role B")}
          <div className="chat__roles-note">
            Each turn is grounded in the current circuit + attached context. A
            speaks first; turns alternate. Use <b>+ context</b> to attach panel
            snapshots so the debate stays honest.
          </div>
        </div>
      )}
    </div>
  );
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
