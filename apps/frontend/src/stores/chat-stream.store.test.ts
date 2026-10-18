import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStreamStore } from "./chat-stream.store";

const state = () => useChatStreamStore.getState();

beforeEach(() => {
  useChatStreamStore.setState({ streams: {} });
});

describe("chat stream store", () => {
  it("moves waiting -> streaming -> removed", () => {
    state().start("p1", new AbortController());
    expect(state().streams.p1).toMatchObject({ phase: "waiting", content: "" });

    state().setAssistantMessage("p1", "m1");
    state().appendToken("p1", "Hel");
    state().appendToken("p1", "lo");
    expect(state().streams.p1).toMatchObject({
      assistantMessageId: "m1",
      phase: "streaming",
      content: "Hello",
    });

    state().finish("p1");
    expect(state().streams.p1).toBeUndefined();
  });

  it("abort aborts the controller, removes the entry and returns the partial content", () => {
    const controller = new AbortController();
    const onAbort = vi.fn();
    controller.signal.addEventListener("abort", onAbort);
    state().start("p1", controller);
    state().appendToken("p1", "partial");

    expect(state().abort("p1")).toBe("partial");

    expect(onAbort).toHaveBeenCalledOnce();
    expect(state().streams.p1).toBeUndefined();
  });

  it("returns an empty string when aborting an unknown project", () => {
    expect(state().abort("nope")).toBe("");
  });

  it("keeps entries for different projects independent", () => {
    state().start("p1", new AbortController());
    state().start("p2", new AbortController());

    state().appendToken("p1", "a");
    expect(state().streams.p2).toMatchObject({ content: "", phase: "waiting" });

    state().finish("p1");
    expect(state().streams.p2).toBeDefined();
  });

  it("ignores updates for projects without a stream", () => {
    state().appendToken("ghost", "x");
    state().setAssistantMessage("ghost", "m");
    expect(state().streams).toEqual({});
  });

  it("aborts the previous controller when a project starts a new stream", () => {
    const first = new AbortController();
    const second = new AbortController();
    state().start("p1", first);
    state().appendToken("p1", "old");

    state().start("p1", second);

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(state().streams.p1).toMatchObject({ content: "", phase: "waiting" });
  });

  it("ignores tokens for another message id once the assistant message is known", () => {
    state().start("p1", new AbortController());
    state().appendToken("p1", "before", "any-id"); // not yet known: accepted
    state().setAssistantMessage("p1", "m1");

    state().appendToken("p1", "stale", "m0");
    state().appendToken("p1", " fresh", "m1");

    expect(state().streams.p1?.content).toBe("before fresh");
  });
});
