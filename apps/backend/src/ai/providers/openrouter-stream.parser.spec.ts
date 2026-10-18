import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";
import {
  parseOpenRouterChunk,
  parseOpenRouterStream,
  STREAM_DONE,
} from "./openrouter-stream.parser";

const encoder = new TextEncoder();

function bytes(...parts: string[]): AsyncIterable<Uint8Array> {
  return Readable.from(parts.map((part) => encoder.encode(part)));
}

async function collect(source: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of source) out.push(delta);
  return out;
}

const delta = (content: string): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe("parseOpenRouterChunk", () => {
  it("returns the delta text of a data line", () => {
    expect(
      parseOpenRouterChunk('data: {"choices":[{"delta":{"content":"Hi"}}]}'),
    ).toBe("Hi");
  });

  it("ignores keep-alive comments, blank lines and role-only deltas", () => {
    expect(parseOpenRouterChunk(": OPENROUTER PROCESSING")).toBeNull();
    expect(parseOpenRouterChunk("")).toBeNull();
    expect(
      parseOpenRouterChunk(
        'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      ),
    ).toBeNull();
  });

  it("recognises [DONE]", () => {
    expect(parseOpenRouterChunk("data: [DONE]")).toBe(STREAM_DONE);
  });

  it("maps an error object to AiProviderErrorException", () => {
    expect(() =>
      parseOpenRouterChunk('data: {"error":{"message":"boom","code":500}}'),
    ).toThrow(AiProviderErrorException);
  });

  it("maps malformed JSON and unexpected shapes to AiBadResponseException", () => {
    expect(() => parseOpenRouterChunk("data: {oops")).toThrow(
      AiBadResponseException,
    );
    expect(() => parseOpenRouterChunk('data: {"choices":"nope"}')).toThrow(
      AiBadResponseException,
    );
  });
});

describe("parseOpenRouterChunk edge cases", () => {
  it("accepts `data:` without a following space", () => {
    expect(
      parseOpenRouterChunk('data:{"choices":[{"delta":{"content":"Hi"}}]}'),
    ).toBe("Hi");
    expect(parseOpenRouterChunk("data:[DONE]")).toBe(STREAM_DONE);
  });

  it("handles CRLF line endings", () => {
    expect(
      parseOpenRouterChunk('data: {"choices":[{"delta":{"content":"Hi"}}]}\r'),
    ).toBe("Hi");
  });

  it("maps finish_reason: error to AiProviderErrorException", () => {
    expect(() =>
      parseOpenRouterChunk(
        'data: {"choices":[{"delta":{},"finish_reason":"error"}]}',
      ),
    ).toThrow(AiProviderErrorException);
  });
});

describe("parseOpenRouterStream with CRLF", () => {
  it("yields deltas from a CRLF-terminated stream", async () => {
    const frame = (text: string): string =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\n`;

    const result = await collect(
      parseOpenRouterStream(
        bytes(frame("a"), frame("b"), "data: [DONE]\r\n\r\n"),
      ),
    );

    expect(result).toEqual(["a", "b"]);
  });
});

describe("parseOpenRouterStream", () => {
  it("yields deltas and stops at [DONE]", async () => {
    const result = await collect(
      parseOpenRouterStream(
        bytes(delta("Hel"), delta("lo"), "data: [DONE]\n\n", delta("ignored")),
      ),
    );

    expect(result).toEqual(["Hel", "lo"]);
  });

  it("reassembles a line split across network chunks", async () => {
    const line = delta("split");
    const result = await collect(
      parseOpenRouterStream(
        bytes(": OPENROUTER PROCESSING\n\n", line.slice(0, 20), line.slice(20)),
      ),
    );

    expect(result).toEqual(["split"]);
  });

  it("handles a final line without a trailing newline", async () => {
    const result = await collect(
      parseOpenRouterStream(bytes(delta("a").trimEnd())),
    );

    expect(result).toEqual(["a"]);
  });

  it("throws AiBadResponseException when the stream has no content", async () => {
    await expect(
      collect(parseOpenRouterStream(bytes(": ping\n\n", "data: [DONE]\n\n"))),
    ).rejects.toBeInstanceOf(AiBadResponseException);
    await expect(
      collect(parseOpenRouterStream(bytes(""))),
    ).rejects.toBeInstanceOf(AiBadResponseException);
  });

  it("throws AiProviderErrorException for an error mid-stream", async () => {
    await expect(
      collect(
        parseOpenRouterStream(
          bytes(delta("x"), 'data: {"error":{"message":"upstream"}}\n\n'),
        ),
      ),
    ).rejects.toBeInstanceOf(AiProviderErrorException);
  });
});
