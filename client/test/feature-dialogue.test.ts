import { describe, test, expect } from "vitest";
import {
  buildTurnMessages,
  mergeConsecutive,
  nextSpeakerOf,
  turnsAreConverging,
  dialogueToMarkdown,
  DIALOGUE_PRESETS,
  type DialogueTurn,
  type Role,
} from "../src/panels/dialogue";

const roleA: Role = { name: "Proposer", persona: "You propose.", model: "m-a" };
const roleB: Role = { name: "Critic", persona: "You criticize.", model: "m-b" };
const roles = { roleA, roleB };
const CTX = "```qasm\nOPENQASM 3;\n```";

describe("nextSpeakerOf", () => {
  test("empty transcript starts with A", () => {
    expect(nextSpeakerOf([])).toBe("A");
  });
  test("alternates from the last AI turn, ignoring user interjections", () => {
    expect(nextSpeakerOf([{ speaker: "A", name: "Proposer", content: "x" }])).toBe("B");
    expect(nextSpeakerOf([
      { speaker: "A", name: "Proposer", content: "x" },
      { speaker: "B", name: "Critic", content: "y" },
    ])).toBe("A");
    expect(nextSpeakerOf([
      { speaker: "A", name: "Proposer", content: "x" },
      { speaker: "user", name: "User", content: "wait" },
    ])).toBe("B");
  });
});

describe("mergeConsecutive", () => {
  test("merges adjacent same-role messages but never the system message", () => {
    const merged = mergeConsecutive([
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toEqual({ role: "system", content: "sys" });
    expect(merged[1]).toEqual({ role: "user", content: "a\n\nb" });
    expect(merged[2]).toEqual({ role: "assistant", content: "c" });
  });
});

describe("buildTurnMessages", () => {
  test("A's first turn: system carries persona + context, then the topic", () => {
    const msgs = buildTurnMessages("A", roles, CTX, "Optimize this", []);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("You propose.");
    expect(msgs[0].content).toContain('You are "Proposer"');
    expect(msgs[0].content).toContain("Critic");
    expect(msgs[0].content).toContain(CTX);
    expect(msgs[1]).toEqual({ role: "user", content: "Discussion topic from the user:\nOptimize this" });
    // strictly user after system
    expect(msgs.every((m, i) => i === 0 || m.role !== "system")).toBe(true);
  });

  test("B's first turn folds the topic and A's reply into one user message (alternation)", () => {
    const transcript: DialogueTurn[] = [{ speaker: "A", name: "Proposer", content: "use H then CX" }];
    const msgs = buildTurnMessages("B", roles, CTX, "Optimize this", transcript);
    // system, then a single merged user message (topic + "Proposer: ...")
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("You criticize.");
    expect(msgs).toHaveLength(2);
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("Optimize this");
    expect(msgs[1].content).toContain("Proposer: use H then CX");
  });

  test("speaker's own past turns map to assistant; others to labeled user; roles strictly alternate", () => {
    const transcript: DialogueTurn[] = [
      { speaker: "A", name: "Proposer", content: "A1" },
      { speaker: "B", name: "Critic", content: "B1" },
    ];
    const msgs = buildTurnMessages("A", roles, CTX, "topic", transcript);
    // [system, user(topic), assistant(A1), user(Critic: B1)]
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[2].content).toBe("A1");
    expect(msgs[3].content).toBe("Critic: B1");
    // no two adjacent non-system messages share a role
    for (let i = 2; i < msgs.length; i++) expect(msgs[i].role).not.toBe(msgs[i - 1].role);
  });

  test("user interjections are labeled 'User' for the other speaker", () => {
    const transcript: DialogueTurn[] = [
      { speaker: "A", name: "Proposer", content: "A1" },
      { speaker: "user", name: "User", content: "focus on T-count" },
    ];
    const msgs = buildTurnMessages("B", roles, CTX, "topic", transcript);
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("Proposer: A1");
    expect(joined).toContain("User: focus on T-count");
  });
});

describe("turnsAreConverging", () => {
  const long = "The circuit applies a Hadamard on qubit zero then a controlled not entangling the two qubits into a Bell state which is maximally entangled";
  test("near-verbatim repeats are flagged as converged", () => {
    expect(turnsAreConverging(long, long)).toBe(true);
  });
  test("substantively different turns are not flagged", () => {
    const other = "I disagree; the better approach is to transpile everything to the Rigetti native gate set using KAK decomposition and measure the resource savings on two qubit gates";
    expect(turnsAreConverging(long, other)).toBe(false);
  });
  test("short turns are never flagged (too little to judge)", () => {
    expect(turnsAreConverging("I agree.", "I agree.")).toBe(false);
  });
});

describe("dialogueToMarkdown", () => {
  const turns: DialogueTurn[] = [
    { speaker: "A", name: "Proposer", content: "Use H then CX." },
    { speaker: "B", name: "Critic", content: "Agreed, that makes a Bell state." },
    { speaker: "user", name: "User", content: "What about noise?" },
  ];
  test("renders header, topic, participants, and each turn as a section", () => {
    const md = dialogueToMarkdown(turns, {
      roleA, roleB, topic: "Make a Bell state", circuitName: "bell", date: "2026-06-07",
    });
    expect(md).toContain("# AI dialogue — bell");
    expect(md).toContain("2026-06-07");
    expect(md).toContain("**Participants:** Proposer `m-a` ↔ Critic `m-b`");
    expect(md).toContain("**Topic:** Make a Bell state");
    expect(md).toContain("### Proposer\n\nUse H then CX.");
    expect(md).toContain("### Critic\n\nAgreed, that makes a Bell state.");
    expect(md).toContain("### 👤 User\n\nWhat about noise?");
  });
  test("embeds the circuit QASM when provided", () => {
    const md = dialogueToMarkdown(turns, { roleA, roleB, topic: "t", qasm: "OPENQASM 3;" });
    expect(md).toContain("## Circuit");
    expect(md).toContain("```qasm\nOPENQASM 3;\n```");
  });
  test("omits the Circuit section when no QASM is given", () => {
    const md = dialogueToMarkdown(turns, { roleA, roleB, topic: "t" });
    expect(md).not.toContain("## Circuit");
  });
});

describe("DIALOGUE_PRESETS", () => {
  test("each preset has two distinct named roles with non-empty personas", () => {
    expect(DIALOGUE_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of DIALOGUE_PRESETS) {
      expect(p.a.name).not.toBe(p.b.name);
      expect(p.a.persona.length).toBeGreaterThan(10);
      expect(p.b.persona.length).toBeGreaterThan(10);
    }
  });
});
