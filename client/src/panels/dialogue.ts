/**
 * AI ↔ AI dialogue mode for the chat panel.
 *
 * Two model instances ("A" and "B") take roles and discuss the user's current
 * circuit, turn by turn. Every turn is grounded in the *same* circuit/simulation
 * context the normal chat attaches, so the exchange stays honest — claims can be
 * checked against what Quantiom actually computes. The user can seed a topic,
 * watch the turns stream, stop at any point, and inject their own message to
 * steer the conversation ("jump in").
 *
 * This module holds the pure, testable core: role/config types, presets,
 * persistence, the per-turn message assembly, and the speaker bookkeeping. The
 * React runner that drives `streamChat` lives in ChatPanel.tsx.
 */

import type { ChatMessage } from "../sim/openrouter";

export type Role = {
  /** Display name / persona label, e.g. "Proposer". */
  name: string;
  /** System-prompt persona describing how this role behaves. */
  persona: string;
  /** OpenRouter model id for this side. */
  model: string;
};

/** "A"/"B" are the two AIs; "user" is a human interjection in the transcript. */
export type Speaker = "A" | "B" | "user";

export type DialogueTurn = {
  speaker: Speaker;
  /** Resolved display name at the time the turn was produced. */
  name: string;
  content: string;
};

export type DialogueConfig = {
  roleA: Role;
  roleB: Role;
  /** How many AI turns to run per launch/continue. */
  maxTurns: number;
};

export type DialoguePreset = {
  label: string;
  a: { name: string; persona: string };
  b: { name: string; persona: string };
};

const MATH_NOTE =
  "Write mathematics in LaTeX (inline $…$, display $$…$$; \\ket{}, \\bra{} and " +
  "\\braket{}{} are available).";

export const DIALOGUE_PRESETS: DialoguePreset[] = [
  {
    label: "Proposer ↔ Critic",
    a: {
      name: "Proposer",
      persona:
        "You are the Proposer. You suggest circuits, optimizations, and design " +
        "choices and defend your reasoning. Be bold but precise, and back claims " +
        "with the circuit and simulation context.",
    },
    b: {
      name: "Critic",
      persona:
        "You are the Critic. You rigorously check the other participant's claims " +
        "against the circuit and simulation context, point out errors or " +
        "unsupported assertions, and demand justification. Be skeptical but fair.",
    },
  },
  {
    label: "Professor ↔ Student",
    a: {
      name: "Professor",
      persona:
        "You are the Professor. Explain the circuit's behavior with rigorous, " +
        "concise mathematics, anticipating and correcting misconceptions.",
    },
    b: {
      name: "Student",
      persona:
        "You are the Student — sharp and curious. Ask the probing follow-up " +
        "questions a thoughtful learner would, pushing for deeper understanding " +
        "and concrete examples. Do not just agree; surface what is still unclear.",
    },
  },
  {
    label: "IBM ↔ Rigetti",
    a: {
      name: "IBM advocate",
      persona:
        "You argue for compiling this circuit to the IBM heavy-hex native gate " +
        "set {RZ, SX, CX}. Make the case on gate count, depth, and connectivity, " +
        "grounded in the actual circuit.",
    },
    b: {
      name: "Rigetti advocate",
      persona:
        "You argue for compiling this circuit to the Rigetti native gate set " +
        "{RZ, RX(±π/2), CZ}. Make the case on gate count, depth, and " +
        "connectivity, grounded in the actual circuit.",
    },
  },
];

export const DEFAULT_DIALOGUE: DialogueConfig = {
  roleA: { ...DIALOGUE_PRESETS[0].a, model: "" },
  roleB: { ...DIALOGUE_PRESETS[0].b, model: "" },
  maxTurns: 6,
};

// ─── Persistence (config only; the transcript stays in memory) ─────────────

const KEY_DIALOGUE = "quantiom:chat:dialogue";

export function loadDialogue(): DialogueConfig {
  try {
    const raw = localStorage.getItem(KEY_DIALOGUE);
    if (!raw) return { ...DEFAULT_DIALOGUE };
    const p = JSON.parse(raw);
    const role = (r: unknown, fb: Role): Role => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        name: typeof o.name === "string" && o.name.trim() ? o.name : fb.name,
        persona: typeof o.persona === "string" && o.persona.trim() ? o.persona : fb.persona,
        model: typeof o.model === "string" ? o.model : "",
      };
    };
    const turns = Number((p as { maxTurns?: unknown }).maxTurns);
    return {
      roleA: role((p as { roleA?: unknown }).roleA, DEFAULT_DIALOGUE.roleA),
      roleB: role((p as { roleB?: unknown }).roleB, DEFAULT_DIALOGUE.roleB),
      maxTurns: Number.isFinite(turns) ? Math.max(2, Math.min(20, Math.round(turns))) : DEFAULT_DIALOGUE.maxTurns,
    };
  } catch {
    return { ...DEFAULT_DIALOGUE };
  }
}

export function saveDialogue(cfg: DialogueConfig): void {
  try { localStorage.setItem(KEY_DIALOGUE, JSON.stringify(cfg)); } catch { /* ignore */ }
}

// ─── Markdown export (pure) ────────────────────────────────────────────────

export type DialogueExportMeta = {
  roleA: Role;
  roleB: Role;
  topic: string;
  /** Optional circuit name for the title. */
  circuitName?: string;
  /** Optional circuit OpenQASM 3 to embed. */
  qasm?: string;
  /** ISO timestamp; defaults to now. */
  date?: string;
};

/**
 * Render a dialogue transcript as shareable Markdown: a header with the roles,
 * models, topic and (optionally) the circuit, then each turn as a section.
 * Pure — takes everything it needs as arguments.
 */
export function dialogueToMarkdown(turns: DialogueTurn[], meta: DialogueExportMeta): string {
  const date = meta.date ?? new Date().toISOString().slice(0, 10);
  const title = meta.circuitName ? `AI dialogue — ${meta.circuitName}` : "AI dialogue";
  const modelOf = (r: Role) => (r.model ? ` \`${r.model}\`` : "");
  const lines: string[] = [
    `# ${title}`,
    "",
    `*Generated by [Quantiom](https://quantiom.fly.dev) on ${date}.*`,
    "",
    `**Participants:** ${meta.roleA.name}${modelOf(meta.roleA)} ↔ ${meta.roleB.name}${modelOf(meta.roleB)}`,
    "",
    `**Topic:** ${meta.topic || "(none)"}`,
    "",
  ];
  if (meta.qasm && meta.qasm.trim()) {
    lines.push("## Circuit", "", "```qasm", meta.qasm.trim(), "```", "");
  }
  lines.push("## Transcript", "");
  for (const t of turns) {
    const heading = t.speaker === "user" ? (t.name === "system" ? "_System_" : "👤 User") : t.name;
    lines.push(`### ${heading}`, "", t.content.trim(), "");
  }
  return lines.join("\n");
}

// ─── Turn assembly (pure) ──────────────────────────────────────────────────

/**
 * Best-effort "the discussion has converged" detector: true when two turns are
 * near-verbatim (word-set Jaccard ≥ threshold), which signals the models are
 * echoing each other / looping. Used to end a run early instead of paying for
 * the rest of the turn cap. High threshold + minimum length keep it from
 * cutting a healthy debate short. Pure.
 */
export function turnsAreConverging(a: string, b: string, threshold = 0.8): boolean {
  const toks = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const A = toks(a), B = toks(b);
  if (A.size < 8 || B.size < 8) return false; // too short to judge reliably
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 && inter / union >= threshold;
}

/** Whose turn comes next, given the transcript so far. Alternates A/B, ignoring
 *  user interjections; defaults to "A" when no AI has spoken yet. */
export function nextSpeakerOf(transcript: DialogueTurn[]): "A" | "B" {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const s = transcript[i].speaker;
    if (s === "A") return "B";
    if (s === "B") return "A";
  }
  return "A";
}

/** Merge adjacent same-role messages so the request strictly alternates
 *  user/assistant (some providers reject consecutive same-role turns). The
 *  leading system message is left untouched. */
export function mergeConsecutive(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role && m.role !== "system") {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/**
 * Build the OpenRouter message list for one turn from `speaker`'s point of view:
 * the speaker's persona + grounding context as the system message, the user's
 * topic, then the transcript with the *other* participant's (and any human's)
 * turns as `user` and the speaker's own as `assistant`.
 */
export function buildTurnMessages(
  speaker: "A" | "B",
  roles: { roleA: Role; roleB: Role },
  contextBlock: string,
  topic: string,
  transcript: DialogueTurn[],
): ChatMessage[] {
  const self = speaker === "A" ? roles.roleA : roles.roleB;
  const other = speaker === "A" ? roles.roleB : roles.roleA;

  const system =
    `${self.persona}\n\n` +
    `You are "${self.name}", one of two AI participants in a technical discussion ` +
    `about the user's quantum circuit inside Quantiom; the other participant is ` +
    `"${other.name}". Ground every claim in the circuit and simulation context ` +
    `below. Be concise and substantive — this is an exchange of ideas, not small ` +
    `talk. When you propose or modify a circuit, emit it in a \`\`\`qasm code ` +
    `block. Speak only as ${self.name}: write a single reply, never continue the ` +
    `other participant's lines, and do not prefix your reply with your own name. ` +
    `${MATH_NOTE}\n\n` +
    `Circuit and simulation context:\n\n${contextBlock}`;

  const msgs: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: `Discussion topic from the user:\n${topic}` },
  ];
  for (const t of transcript) {
    if (t.speaker === speaker) {
      msgs.push({ role: "assistant", content: t.content });
    } else {
      const label = t.speaker === "user" ? "User" : t.name;
      msgs.push({ role: "user", content: `${label}: ${t.content}` });
    }
  }
  return mergeConsecutive(msgs);
}
