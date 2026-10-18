import { describe, expect, it } from "vitest";

import { readSseRecords, type SseRecord } from "./sse-reader";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(...chunks: string[]): Promise<SseRecord[]> {
  const records: SseRecord[] = [];
  for await (const record of readSseRecords(streamOf(...chunks))) records.push(record);
  return records;
}

describe("readSseRecords", () => {
  it("reassembles an event split across chunks", async () => {
    expect(await collect('event: tok', 'en\ndata: {"a"', ":1}\n", "\n")).toEqual([
      { event: "token", data: '{"a":1}' },
    ]);
  });

  it("yields several events from one chunk", async () => {
    expect(await collect("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("handles CRLF, including a CRLF split between chunks", async () => {
    expect(await collect("event: a\r\ndata: 1\r", "\n\r\n")).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("joins multi-line data with a newline", async () => {
    expect(await collect("data: one\ndata: two\n\n")).toEqual([
      { event: "message", data: "one\ntwo" },
    ]);
  });

  it("ignores comment lines such as pings", async () => {
    expect(await collect(": ping\n\nevent: a\n: ping\ndata: 1\n\n")).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("drops a trailing partial event", async () => {
    expect(await collect("event: a\ndata: 1\n\nevent: b\ndata: 2")).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode("data: é\n\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    const records: SseRecord[] = [];
    for await (const record of readSseRecords(stream)) records.push(record);
    expect(records).toEqual([{ event: "message", data: "é" }]);
  });

  it("flushes an event whose blank line is a trailing CR at the end of the stream", async () => {
    expect(await collect("data: 1\r\r")).toEqual([{ event: "message", data: "1" }]);
    expect(await collect("event: a\r\ndata: 1\r\n", "\r")).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("does not dispatch an event that ends without a blank line", async () => {
    expect(await collect("data: 1\r")).toEqual([]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collect()).toEqual([]);
    expect(await collect("")).toEqual([]);
  });
});
