import { describe, expect, it } from "vitest";

import { isRetryable, type RetryCandidate } from "./retry-eligibility.util";

const retryable: RetryCandidate = {
  role: "assistant",
  status: "error",
  conversationArchived: false,
  hasLaterMessages: false,
};

describe("isRetryable", () => {
  it.each(["error", "aborted"] as const)(
    "allows the last %s assistant message of the active conversation",
    (status) => {
      expect(isRetryable({ ...retryable, status })).toBe(true);
    },
  );

  it.each(["complete", "streaming"] as const)(
    "rejects a %s message",
    (status) => {
      expect(isRetryable({ ...retryable, status })).toBe(false);
    },
  );

  it("rejects a user message", () => {
    expect(isRetryable({ ...retryable, role: "user" })).toBe(false);
  });

  it("rejects a message that is not the last one", () => {
    expect(isRetryable({ ...retryable, hasLaterMessages: true })).toBe(false);
  });

  it("rejects a message in an archived conversation", () => {
    expect(isRetryable({ ...retryable, conversationArchived: true })).toBe(
      false,
    );
  });
});
