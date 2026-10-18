import { describe, expect, it } from "vitest";

import {
  AiBadResponseException,
  AiProviderErrorException,
} from "../../common/exceptions";
import { parseGeminiChunk, parseGeminiStream } from "./gemini-stream.parser";
import { bytes, collect } from "./provider-test.helpers";

const chunk = (
  parts: { text?: string; thought?: boolean }[],
  extra: Record<string, unknown> = {},
): string =>
  `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts }, ...extra }] })}\n\n`;

describe("parseGeminiChunk", () => {
  it("joins the text of all parts as the delta", () => {
    expect(
      parseGeminiChunk(chunk([{ text: "Hel" }, { text: "lo" }]).trim()),
    ).toBe("Hello");
  });

  it("skips thought parts, blank lines and non-data lines", () => {
    expect(
      parseGeminiChunk(chunk([{ text: "hmm", thought: true }]).trim()),
    ).toBeNull();
    expect(parseGeminiChunk("")).toBeNull();
    expect(parseGeminiChunk(": keep-alive")).toBeNull();
  });

  it("returns null for a finish chunk without text", () => {
    expect(
      parseGeminiChunk(chunk([], { finishReason: "STOP" }).trim()),
    ).toBeNull();
  });

  it("maps an error object to AiProviderErrorException", () => {
    expect(() =>
      parseGeminiChunk('data: {"error":{"code":429,"message":"quota"}}'),
    ).toThrow(AiProviderErrorException);
  });

  it("maps a blocked prompt to AiProviderErrorException", () => {
    expect(() =>
      parseGeminiChunk('data: {"promptFeedback":{"blockReason":"SAFETY"}}'),
    ).toThrow(AiProviderErrorException);
  });

  it.each(["SAFETY", "BLOCKED"])(
    "maps finishReason %s to AiProviderErrorException",
    (reason) => {
      expect(() =>
        parseGeminiChunk(
          chunk([{ text: "x" }], { finishReason: reason }).trim(),
        ),
      ).toThrow(AiProviderErrorException);
    },
  );

  it("maps malformed JSON and unexpected shapes to AiBadResponseException", () => {
    expect(() => parseGeminiChunk("data: {oops")).toThrow(
      AiBadResponseException,
    );
    expect(() => parseGeminiChunk('data: {"candidates":"nope"}')).toThrow(
      AiBadResponseException,
    );
  });
});

describe("parseGeminiStream", () => {
  it("yields deltas in order", async () => {
    const result = await collect(
      parseGeminiStream(
        bytes(
          chunk([{ text: "Hel" }]),
          chunk([{ text: "lo" }], { finishReason: "STOP" }),
        ),
      ),
    );

    expect(result).toEqual(["Hel", "lo"]);
  });

  it("reassembles a line split across chunks and a split multi-byte character", async () => {
    const encoded = new TextEncoder().encode(chunk([{ text: "naïve ☕" }]));
    const cut = encoded.indexOf(0xc3) + 1;

    const result = await collect(
      parseGeminiStream(bytes(encoded.slice(0, cut), encoded.slice(cut))),
    );

    expect(result).toEqual(["naïve ☕"]);
  });

  it("throws AiBadResponseException for an empty stream", async () => {
    await expect(collect(parseGeminiStream(bytes("")))).rejects.toBeInstanceOf(
      AiBadResponseException,
    );
  });

  it("throws AiProviderErrorException when the stream is blocked after some text", async () => {
    await expect(
      collect(
        parseGeminiStream(
          bytes(chunk([{ text: "ok" }]), chunk([], { finishReason: "SAFETY" })),
        ),
      ),
    ).rejects.toBeInstanceOf(AiProviderErrorException);
  });
});
