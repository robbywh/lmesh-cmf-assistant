import type { Message } from "@lmesh/api-contract";

import type { AiChatMessage } from "../ai/ai-provider.interface";
import {
  buildSystemPrompt,
  type PromptProject,
  SUMMARY_PREFIX,
} from "./prompts.util";

/** The message fields the window needs; the contract `Message` satisfies it. */
export type HistoryMessage = Pick<
  Message,
  "role" | "kind" | "content" | "status"
>;

export interface PromptInput {
  project: PromptProject;
  /**
   * The conversation's messages in order, created BEFORE the message being
   * answered (never the in-flight assistant placeholder). For a retry, pass the
   * messages created before the retried message.
   */
  messages: HistoryMessage[];
  /** `AI_HISTORY_MAX_MESSAGES`. */
  maxMessages: number;
  /** `AI_HISTORY_MAX_CHARS`. */
  maxChars: number;
  /** Final user turn for summarise requests (`SUMMARY_INSTRUCTION`). */
  instruction?: string;
}

const isSummary = (message: HistoryMessage): boolean =>
  message.kind === "summary";

/** Summaries go back to the model as assistant turns carrying the prefix. */
const toChatMessage = (message: HistoryMessage): AiChatMessage =>
  isSummary(message)
    ? { role: "assistant", content: `${SUMMARY_PREFIX}\n${message.content}` }
    : { role: message.role, content: message.content };

const totalChars = (messages: AiChatMessage[]): number =>
  messages.reduce((sum, message) => sum + message.content.length, 0);

/**
 * Builds the messages sent to the AI for send, retry and summarise (FSD 10.3).
 * Only `complete` messages count; the last `maxMessages` are kept; the oldest are
 * dropped until the total fits `maxChars`, except the newest user message, which
 * is always kept (except for summarise requests, which keep at least the instruction). The latest summary is pinned right after the system prompt
 * whenever it is not inside the window. Pure: same input, same output.
 * @param input Project, prior messages, limits and optional final instruction.
 * @returns `[system, pinned summary?, ...window, instruction?]`.
 */
export function buildPromptMessages(input: PromptInput): AiChatMessage[] {
  const { project, messages, maxMessages, maxChars, instruction } = input;
  const system: AiChatMessage = {
    role: "system",
    content: buildSystemPrompt(project),
  };
  const closing: AiChatMessage[] = instruction
    ? [{ role: "user", content: instruction }]
    : [];

  const eligible = messages.filter((message) => message.status === "complete");
  const latestSummary = eligible.findLast(isSummary);
  const newestUser = eligible.findLast((message) => message.role === "user");

  const window = eligible.slice(-Math.max(1, maxMessages));

  const assemble = (): AiChatMessage[] => {
    const pinned =
      latestSummary && !window.includes(latestSummary)
        ? [toChatMessage(latestSummary)]
        : [];
    return [system, ...pinned, ...window.map(toChatMessage), ...closing];
  };

  // Send/retry must keep the newest user message; a summarise request only needs its instruction.
  const mayDrop = (oldest: HistoryMessage): boolean =>
    instruction !== undefined || oldest !== newestUser;

  while (
    totalChars(assemble()) > maxChars &&
    window.length > 0 &&
    mayDrop(window[0]!)
  ) {
    window.shift();
  }

  return assemble();
}
