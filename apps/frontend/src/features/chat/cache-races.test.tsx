import { ErrorCode, type ActiveConversation } from "@lmesh/api-contract";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { conversationKey } from "@/features/projects/projects-queries";
import { SEED_PROJECT_IDS, buildMessage } from "@/mocks/fixtures";
import { errorHandler, ok, route } from "@/mocks/handlers";
import { mockStore, setStreamScenario, signInMock } from "@/mocks/mock-store";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

import { DEFAULT_STREAM_TIMINGS, streamTimings } from "./stream-timings";

const EV = SEED_PROJECT_IDS.ev;

const items = () => screen.queryAllByTestId("message-item");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function typeAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(await screen.findByLabelText("Message"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

const snapshot = (): ActiveConversation => structuredClone(mockStore.conversations.get(EV)!);

beforeEach(() => {
  signInMock();
});

afterEach(() => {
  Object.assign(streamTimings, DEFAULT_STREAM_TIMINGS);
});

describe("resync after Stop", () => {
  it("is cancelled by a new send, which keeps its own messages", async () => {
    streamTimings.resyncDelaysMs = [700, 900];
    setStreamScenario({ kind: "success", tokenDelayMs: 30 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "first");
    await waitFor(() => expect(items()[1]!.textContent).toContain("Warm"));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    // What the server said before the second message existed.
    const stale = snapshot();
    stale.messages[1]!.status = "aborted";
    server.use(route("getActiveConversation", () => ok(stale)));
    await waitFor(() => expect(mockStore.openStreams.size).toBe(0)); // mock cannot see the abort

    await typeAndSend(user, "second");
    await waitFor(() => expect(items()).toHaveLength(4));
    await waitFor(() => expect(items()[3]).toHaveAttribute("data-status", "complete"));
    await sleep(900); // past the cancelled resync's first attempt
    expect(items()).toHaveLength(4);
    expect(items()[2]).toHaveTextContent("second");
  });

  it("is cancelled by a reset, which keeps the empty conversation", async () => {
    streamTimings.resyncDelaysMs = [900];
    setStreamScenario({ kind: "success", tokenDelayMs: 30 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "first");
    await waitFor(() => expect(items()[1]!.textContent).toContain("Warm"));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    const stale = snapshot();
    stale.messages[1]!.status = "aborted";
    server.use(route("getActiveConversation", () => ok(stale)));
    await waitFor(() => expect(mockStore.openStreams.size).toBe(0));

    await user.click(screen.getByRole("button", { name: "Reset conversation" }));
    await user.click(
      await screen.findByRole("button", { name: "Reset" }),
    );
    expect(await screen.findByText("Start the conversation")).toBeInTheDocument();
    await sleep(1100); // past the cancelled resync
    expect(screen.getByText("Start the conversation")).toBeInTheDocument();
    expect(items()).toHaveLength(0);
  });

  it("keeps the local aborted row when the server still says streaming, then invalidates later", async () => {
    streamTimings.resyncDelaysMs = [30, 30];
    streamTimings.lateInvalidateMs = 250;
    setStreamScenario({ kind: "success", tokenDelayMs: 100 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await typeAndSend(user, "first");
    await waitFor(() => expect(items()[1]!.textContent).toContain("Warm"));

    let calls = 0;
    server.use(
      route("getActiveConversation", () => {
        calls += 1;
        const conversation = snapshot();
        conversation.messages[1]!.status = calls <= 2 ? "streaming" : "aborted";
        return ok(conversation);
      }),
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(calls).toBe(2));
    await sleep(60);
    expect(items()[1]).toHaveAttribute("data-status", "aborted"); // not flipped on the last attempt
    await waitFor(() => expect(calls).toBe(3), { timeout: 2000 }); // the later invalidate
    expect(items()[1]).toHaveAttribute("data-status", "aborted");
  });

  it("treats any streaming row as streaming when Stop came before message.created", async () => {
    streamTimings.resyncDelaysMs = [30];
    streamTimings.lateInvalidateMs = 300;
    server.use(route("sendMessage", () => new Promise<never>(() => undefined))); // never answers
    const conversationId = mockStore.conversations.get(EV)!.id;
    const serverView: ActiveConversation = {
      ...snapshot(),
      messages: [
        buildMessage(conversationId, { role: "user", content: "hello" }),
        buildMessage(conversationId, { role: "assistant", content: "", status: "streaming" }),
      ],
    };
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await typeAndSend(user, "hello");
    server.use(route("getActiveConversation", () => ok(serverView)));
    await user.click(await screen.findByRole("button", { name: "Stop" }));

    await sleep(150); // the resync fetched, but must not apply a streaming row
    expect(items()).toHaveLength(0);
    await waitFor(() => expect(items()).toHaveLength(2), { timeout: 2000 }); // later invalidate
  });
});

describe("conversation fetches racing the stream", () => {
  it("does not let a GET in flight across done revert the final message", async () => {
    setStreamScenario({ kind: "success", tokenDelayMs: 30 });
    const { queryClient } = renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await screen.findByLabelText("Message");

    await typeAndSend(user, "race me");
    await waitFor(() => expect(items()).toHaveLength(2));
    const stale = snapshot();
    stale.messages[1]!.status = "streaming";
    stale.messages[1]!.content = "";
    server.use(
      route("getActiveConversation", async () => {
        await delay(600);
        return ok(stale);
      }),
    );
    void queryClient.invalidateQueries({ queryKey: conversationKey(EV) }); // GET in flight

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "complete"));
    await sleep(800); // the slow GET would land here
    expect(items()[1]).toHaveAttribute("data-status", "complete");
    expect(items()[1]).toHaveTextContent("Warm earth tones");
  });

  it("refetches a streaming row that no local stream drives, until it completes", async () => {
    streamTimings.orphanPollMs = 40;
    const conversation = mockStore.conversations.get(EV)!;
    const orphan = buildMessage(conversation.id, {
      role: "assistant",
      content: "",
      status: "streaming",
    });
    conversation.messages = [orphan];
    renderApp(`/projects/${EV}`);

    expect(await screen.findByTestId("streaming-indicator")).toBeInTheDocument();
    conversation.messages = [{ ...orphan, content: "Finished elsewhere", status: "complete" }];

    expect(await screen.findByText("Finished elsewhere")).toBeInTheDocument();
    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });
});

describe("per-project component state", () => {
  it("does not carry composer text over to another project", async () => {
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Message"), "half-written thought");

    await user.click(screen.getByRole("link", { name: /Sports coupe/ }));
    await screen.findByRole("heading", { level: 1, name: "Sports coupe: dark technical" });

    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("shows the notice only for the project it belongs to", async () => {
    server.use(errorHandler("sendMessage", 409, ErrorCode.STREAM_IN_PROGRESS));
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await typeAndSend(user, "hi");
    expect(await screen.findByText("An answer is already being generated.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /Sports coupe/ }));
    await screen.findByRole("heading", { level: 1, name: "Sports coupe: dark technical" });

    expect(screen.queryByText("An answer is already being generated.")).not.toBeInTheDocument();
  });
});
