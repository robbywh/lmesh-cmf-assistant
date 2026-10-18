import { describe, expect, it } from "vitest";

import {
  buildPromptMessages,
  type HistoryMessage,
  type PromptInput,
} from "./history-window.util";
import {
  buildSystemPrompt,
  SUMMARY_INSTRUCTION,
  SUMMARY_PREFIX,
} from "./prompts.util";

const project = { title: "Coupe", description: "Dark and technical." };

const user = (
  content: string,
  status: HistoryMessage["status"] = "complete",
): HistoryMessage => ({
  role: "user",
  kind: "chat",
  content,
  status,
});
const assistant = (
  content: string,
  status: HistoryMessage["status"] = "complete",
): HistoryMessage => ({ role: "assistant", kind: "chat", content, status });
const summary = (content: string): HistoryMessage => ({
  role: "assistant",
  kind: "summary",
  content,
  status: "complete",
});

function build(
  messages: HistoryMessage[],
  overrides: Partial<PromptInput> = {},
) {
  return buildPromptMessages({
    project,
    messages,
    maxMessages: 20,
    maxChars: 100_000,
    ...overrides,
  });
}

const contents = (messages: { content: string }[]): string[] =>
  messages.map((message) => message.content);

describe("buildPromptMessages", () => {
  it("starts with the system prompt built from the project and ends with the newest user message", () => {
    const result = build([user("a"), assistant("b"), user("c")]);

    expect(result[0]).toEqual({
      role: "system",
      content: buildSystemPrompt(project),
    });
    expect(result.at(-1)).toEqual({ role: "user", content: "c" });
  });

  it("gives [system, user] for the first message after a reset (empty history)", () => {
    const result = build([user("first question")]);

    expect(result.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("keeps only the last N eligible messages", () => {
    const result = build(
      [user("1"), assistant("2"), user("3"), assistant("4"), user("5")],
      { maxMessages: 3 },
    );

    expect(contents(result.slice(1))).toEqual(["3", "4", "5"]);
  });

  it("drops the oldest messages first when the character budget is exceeded", () => {
    const systemLength = buildSystemPrompt(project).length;
    const result = build(
      [
        user("a".repeat(100)),
        assistant("b".repeat(100)),
        user("c".repeat(100)),
      ],
      { maxChars: systemLength + 200 },
    );

    expect(contents(result.slice(1)).map((text) => text[0])).toEqual([
      "b",
      "c",
    ]);
  });

  it("always keeps the newest user message, even when it alone exceeds the budget", () => {
    const result = build(
      [user("old"), assistant("reply"), user("x".repeat(5000))],
      { maxChars: 10 },
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: "user", content: "x".repeat(5000) });
  });

  it("excludes error, aborted and streaming messages", () => {
    const result = build([
      user("q1"),
      assistant("partial", "aborted"),
      user("q2"),
      assistant("failed", "error"),
      user("q3"),
      assistant("", "streaming"),
      user("q4"),
    ]);

    expect(contents(result.slice(1))).toEqual(["q1", "q2", "q3", "q4"]);
  });

  describe("pinned summary", () => {
    const old = [summary("OLD SUMMARY"), user("a"), assistant("b")];
    const latest = [summary("LATEST SUMMARY"), user("c"), assistant("d")];

    it("sends a stored summary as an assistant message with the summary prefix", () => {
      const result = build([summary("S"), user("q")]);

      expect(result[1]).toEqual({
        role: "assistant",
        content: `${SUMMARY_PREFIX}\nS`,
      });
    });

    it("pins the latest summary right after the system prompt when it is outside the window", () => {
      const result = build([...latest, user("e"), assistant("f"), user("g")], {
        maxMessages: 3,
      });

      expect(result.map((message) => message.content)).toEqual([
        buildSystemPrompt(project),
        `${SUMMARY_PREFIX}\nLATEST SUMMARY`,
        "e",
        "f",
        "g",
      ]);
    });

    it("does not duplicate the latest summary when it is inside the window", () => {
      const result = build([...latest, user("e")], { maxMessages: 10 });

      const occurrences = result.filter((message) =>
        message.content.includes("LATEST SUMMARY"),
      );
      expect(occurrences).toHaveLength(1);
      expect(result[1]?.content).toContain("LATEST SUMMARY");
    });

    it("never pins an older summary, only the latest", () => {
      const result = build([...old, ...latest, user("e")], { maxMessages: 2 });

      const text = result.map((message) => message.content).join("\n");
      expect(text).toContain("LATEST SUMMARY");
      expect(text).not.toContain("OLD SUMMARY");
    });

    it("pins the latest summary when the character budget pushes it out of the window", () => {
      const systemLength = buildSystemPrompt(project).length;
      const summaryLength = `${SUMMARY_PREFIX}\nSUM`.length;
      const result = build(
        [
          summary("SUM"),
          user("a".repeat(50)),
          assistant("b".repeat(50)),
          user("c".repeat(50)),
        ],
        {
          maxChars: systemLength + summaryLength + 100,
        },
      );

      expect(contents(result.slice(1))).toEqual([
        `${SUMMARY_PREFIX}\nSUM`,
        "b".repeat(50),
        "c".repeat(50),
      ]);
    });

    it("ignores a summary that is not complete", () => {
      const failed: HistoryMessage = { ...summary("BROKEN"), status: "error" };

      const result = build([failed, user("q")]);

      expect(contents(result)).not.toContain(`${SUMMARY_PREFIX}\nBROKEN`);
    });
  });

  describe("summarise requests", () => {
    it("appends the summary instruction as the last user turn", () => {
      const result = build([user("q"), assistant("a")], {
        instruction: SUMMARY_INSTRUCTION,
      });

      expect(result.at(-1)).toEqual({
        role: "user",
        content: SUMMARY_INSTRUCTION,
      });
      expect(result.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
      ]);
    });

    it("keeps dropping the oldest messages (even the newest user message) to fit the budget, keeping at least the instruction", () => {
      const result = build(
        [user("u".repeat(500)), assistant("a".repeat(500))],
        { instruction: SUMMARY_INSTRUCTION, maxChars: 10 },
      );

      expect(result.map((message) => message.role)).toEqual(["system", "user"]);
      expect(result.at(-1)?.content).toBe(SUMMARY_INSTRUCTION);
    });

    it("counts the instruction toward the character budget", () => {
      const systemLength = buildSystemPrompt(project).length;
      const result = build(
        [
          user("a".repeat(100)),
          assistant("b".repeat(100)),
          user("c".repeat(100)),
        ],
        {
          instruction: "i".repeat(100),
          maxChars: systemLength + 100 + 200,
        },
      );

      expect(contents(result.slice(1)).map((text) => text[0])).toEqual([
        "b",
        "c",
        "i",
      ]);
    });
  });

  it("serves retry too: given the messages before the retried reply, an earlier failed reply is skipped and the question is last", () => {
    const result = build([user("q1"), assistant("", "error"), user("q2")]);

    expect(contents(result.slice(1))).toEqual(["q1", "q2"]);
    expect(result.at(-1)?.role).toBe("user");
  });

  it("is a pure function: an edited project description appears in the next prompt without mutating input", () => {
    const messages = [user("q")];
    const frozen = JSON.stringify(messages);

    const before = build(messages);
    const after = buildPromptMessages({
      project: { ...project, description: "Brand new brief." },
      messages,
      maxMessages: 20,
      maxChars: 100_000,
    });

    expect(before[0]?.content).toContain("Dark and technical.");
    expect(after[0]?.content).toContain("Brand new brief.");
    expect(JSON.stringify(messages)).toBe(frozen);
  });
});
