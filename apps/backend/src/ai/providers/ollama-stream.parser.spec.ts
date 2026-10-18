import { describe, expect, it } from "vitest";

import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";
import { parseOllamaChunk, parseOllamaStream } from "./ollama-stream.parser";
import { bytes, collect } from "./provider-test.helpers";
import { STREAM_DONE } from "./stream.utils";

const line = (content: string, done = false): string =>
  `${JSON.stringify({ model: "m", message: { role: "assistant", content }, done })}\n`;

describe("parseOllamaChunk", () => {
  it("returns the message content as a delta", () => {
    expect(parseOllamaChunk(line("Hi"))).toBe("Hi");
  });

  it("returns STREAM_DONE for the final done chunk without content", () => {
    expect(parseOllamaChunk(line("", true))).toBe(STREAM_DONE);
  });

  it("yields only message.content and ignores message.thinking", () => {
    const withThinking = (thinking: string, content: string): string =>
      JSON.stringify({
        message: { role: "assistant", thinking, content },
        done: false,
      });

    expect(parseOllamaChunk(withThinking("let me think", ""))).toBeNull();
    expect(parseOllamaChunk(withThinking("still thinking", "Answer"))).toBe(
      "Answer",
    );
  });

  it("ignores blank lines and empty content", () => {
    expect(parseOllamaChunk("")).toBeNull();
    expect(parseOllamaChunk(line(""))).toBeNull();
  });

  it("maps an error payload to AiProviderErrorException", () => {
    expect(() => parseOllamaChunk('{"error":"model not found"}')).toThrow(
      AiProviderErrorException,
    );
  });

  it("maps malformed JSON and unexpected shapes to AiBadResponseException", () => {
    expect(() => parseOllamaChunk("{oops")).toThrow(AiBadResponseException);
    expect(() => parseOllamaChunk('{"message":"nope"}')).toThrow(
      AiBadResponseException,
    );
  });
});

describe("parseOllamaStream", () => {
  it("yields deltas and stops at the done marker", async () => {
    const result = await collect(
      parseOllamaStream(
        bytes(line("Hel"), line("lo"), line("", true), line("ignored")),
      ),
    );

    expect(result).toEqual(["Hel", "lo"]);
  });

  it("reassembles a line split across network chunks", async () => {
    const full = line("split");

    const result = await collect(
      parseOllamaStream(bytes(full.slice(0, 15), full.slice(15))),
    );

    expect(result).toEqual(["split"]);
  });

  it("reassembles a multi-byte character split across chunks", async () => {
    const encoded = new TextEncoder().encode(line("café ☕"));
    const cut = encoded.indexOf(0xc3) + 1; // between the two bytes of "é"

    const result = await collect(
      parseOllamaStream(bytes(encoded.slice(0, cut), encoded.slice(cut))),
    );

    expect(result).toEqual(["café ☕"]);
  });

  it("throws AiBadResponseException for an empty stream", async () => {
    await expect(collect(parseOllamaStream(bytes("")))).rejects.toBeInstanceOf(
      AiBadResponseException,
    );
    await expect(
      collect(parseOllamaStream(bytes(line("", true)))),
    ).rejects.toBeInstanceOf(AiBadResponseException);
  });

  it("throws AiProviderErrorException for an error mid-stream", async () => {
    await expect(
      collect(parseOllamaStream(bytes(line("x"), '{"error":"boom"}\n'))),
    ).rejects.toBeInstanceOf(AiProviderErrorException);
  });
});
