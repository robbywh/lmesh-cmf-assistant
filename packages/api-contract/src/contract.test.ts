import { describe, expect, it } from "vitest";

import {
  buildPath,
  CreateProjectRequestSchema,
  endpoints,
  ErrorCode,
  ErrorEnvelopeSchema,
  MESSAGE_CONTENT_MAX,
  SendMessageRequestSchema,
  SseEventSchema,
  UpdateProjectRequestSchema,
} from "./index.js";

const id = "6f1b9c1e-2a4d-4c8e-9a0b-1c2d3e4f5a6b";
const now = "2026-10-18T10:00:00.000Z";

describe("project requests", () => {
  it("trims the title and rejects an empty one", () => {
    expect(CreateProjectRequestSchema.parse({ title: "  SUV  " }).title).toBe(
      "SUV",
    );
    expect(CreateProjectRequestSchema.safeParse({ title: "   " }).success).toBe(
      false,
    );
  });

  it("requires at least one field on update", () => {
    expect(UpdateProjectRequestSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateProjectRequestSchema.safeParse({ description: null }).success,
    ).toBe(true);
  });
});

describe("limits (literal boundaries)", () => {
  it("accepts a 120-char title and rejects 121", () => {
    expect(
      CreateProjectRequestSchema.safeParse({ title: "a".repeat(120) }).success,
    ).toBe(true);
    expect(
      CreateProjectRequestSchema.safeParse({ title: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("accepts a 2000-char description and rejects 2001", () => {
    const ok = { title: "t", description: "d".repeat(2000) };
    const tooLong = { title: "t", description: "d".repeat(2001) };
    expect(CreateProjectRequestSchema.safeParse(ok).success).toBe(true);
    expect(CreateProjectRequestSchema.safeParse(tooLong).success).toBe(false);
  });

  it("accepts a 4000-char message, rejects 4001 and whitespace-only", () => {
    expect(
      SendMessageRequestSchema.safeParse({ content: "m".repeat(4000) }).success,
    ).toBe(true);
    expect(
      SendMessageRequestSchema.safeParse({ content: "m".repeat(4001) }).success,
    ).toBe(false);
    expect(SendMessageRequestSchema.safeParse({ content: "   " }).success).toBe(
      false,
    );
  });
});

describe("message requests", () => {
  it("enforces the content limit", () => {
    const tooLong = "a".repeat(MESSAGE_CONTENT_MAX + 1);
    expect(
      SendMessageRequestSchema.safeParse({ content: tooLong }).success,
    ).toBe(false);
  });
});

describe("SSE events", () => {
  it("parses a token event and rejects unknown types", () => {
    expect(
      SseEventSchema.parse({ type: "token", messageId: id, delta: "Hi" }),
    ).toEqual({ type: "token", messageId: id, delta: "Hi" });
    expect(SseEventSchema.safeParse({ type: "ping" }).success).toBe(false);
  });

  it("parses an error event with a contract error code", () => {
    const event = SseEventSchema.parse({
      type: "error",
      messageId: id,
      code: ErrorCode.AI_TIMEOUT,
      message: "The assistant took too long to respond.",
    });
    expect(event.type).toBe("error");
  });

  it("parses message.created for a summary", () => {
    const assistantMessage = {
      id,
      conversationId: id,
      role: "assistant",
      kind: "summary",
      content: "",
      status: "streaming",
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(
      SseEventSchema.safeParse({
        type: "message.created",
        userMessage: null,
        assistantMessage,
      }).success,
    ).toBe(true);
  });
});

describe("envelopes", () => {
  it("rejects an unknown error code", () => {
    expect(
      ErrorEnvelopeSchema.safeParse({ message: "x", code: "NOPE" }).success,
    ).toBe(false);
  });
});

describe("buildPath", () => {
  it("fills and encodes parameters", () => {
    expect(buildPath(endpoints.getProject.path, { projectId: "a b" })).toBe(
      "/projects/a%20b",
    );
  });

  it("throws on a missing parameter", () => {
    expect(() => buildPath(endpoints.retryMessage.path)).toThrow(/messageId/);
  });
});
