import { ErrorCode, MESSAGE_CONTENT_MAX } from "@lmesh/api-contract";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SEED_PROJECT_IDS } from "@/mocks/fixtures";
import { buildMessage } from "@/mocks/fixtures";
import { route } from "@/mocks/handlers";
import { mockStore, setStreamScenario, signInMock } from "@/mocks/mock-store";
import { encodeSseEvent } from "@/mocks/sse";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

const markdownCalls = vi.hoisted(() => [] as string[]);

vi.mock("./markdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./markdown")>();
  return {
    Markdown: (props: { children: string }) => {
      markdownCalls.push(props.children);
      return actual.Markdown(props);
    },
  };
});

const EV = SEED_PROJECT_IDS.ev;
const SUV = SEED_PROJECT_IDS.suv;

const messageBox = () => screen.getByLabelText("Message");
const items = () => screen.queryAllByTestId("message-item");
const streamingText = () =>
  screen.getByRole("log").querySelector("[aria-live=polite]")?.textContent ?? "";

async function typeAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(await screen.findByLabelText("Message"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("sending a message", () => {
  it("shows the user message, the indicator, growing text and the final message", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 40 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Hello there");

    await waitFor(() => expect(items()[0]).toHaveTextContent("Hello there"));
    expect(items()[0]).toHaveAttribute("data-role", "user");
    expect(messageBox()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(await screen.findByTestId("streaming-indicator")).toHaveTextContent(
      "Assistant is thinking…",
    );

    await waitFor(() => expect(streamingText().length).toBeGreaterThan(0));
    const first = streamingText();
    await waitFor(() => expect(streamingText().length).toBeGreaterThan(first.length));
    const second = streamingText();
    await waitFor(() => expect(streamingText().length).toBeGreaterThan(second.length));

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(2);
    expect(items()[1]).toHaveTextContent("Warm earth tones work best with matte, natural materials.");
    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(messageBox()).toBeEnabled();
    expect(messageBox()).toHaveFocus();
  });

  it("Stop aborts the request and keeps the partial text as Stopped", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 60 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Tell me more");
    await waitFor(() => expect(streamingText().length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "aborted"));
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(items()[1]!.textContent).toContain("Warm");
    expect(messageBox()).toBeEnabled();
    await waitFor(() => expect(mockStore.openStreams.size).toBe(0));
    expect(items()).toHaveLength(2);
  });

  it("shows a mid-stream error as an inline alert with the partial text", async () => {
    signInMock();
    setStreamScenario({ kind: "error-midstream", code: ErrorCode.AI_TIMEOUT });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Will fail");

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("The assistant took too long to respond.")).toBeInTheDocument();
    expect(items()[1]).toHaveTextContent("Warm");
    expect(messageBox()).toBeEnabled();
  });

  it("keeps the stream running when navigating away and back, without duplicates", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 60 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Keep going");
    await waitFor(() => expect(items()).toHaveLength(2));
    await user.click(screen.getByRole("link", { name: /Sports coupe/ }));
    await screen.findByRole("heading", { level: 1, name: "Sports coupe: dark technical" });
    await user.click(screen.getByRole("link", { name: /Urban EV compact/ }));

    await waitFor(() => expect(items()).toHaveLength(2));
    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(2);
    expect(screen.getAllByText("Keep going")).toHaveLength(1);
  });

  it("re-renders only the streaming message per token", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 40 });
    renderApp(`/projects/${SUV}`);
    const user = userEvent.setup();
    await screen.findAllByTestId("message-item");

    markdownCalls.length = 0;
    await typeAndSend(user, "One more question");
    await waitFor(() => expect(streamingText().length).toBeGreaterThan(0));
    await waitFor(() => expect(items().at(-1)).toHaveAttribute("data-status", "complete"));

    const seeded = "A matte, full-grain leather in cognac";
    const seedRenders = markdownCalls.filter((content) => content.startsWith(seeded));
    const streamingRenders = markdownCalls.filter((content) => content.startsWith("Warm"));
    expect(seedRenders.length).toBeLessThanOrEqual(1);
    expect(streamingRenders.length).toBeGreaterThanOrEqual(5);
  });
});

describe("composer input", () => {
  it("sends on Enter and inserts a newline on Shift+Enter", async () => {
    signInMock();
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Message");

    await user.type(box, "line one{Shift>}{Enter}{/Shift}line two");
    expect(box).toHaveValue("line one\nline two");
    expect(items()).toHaveLength(0);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(items()[0]).toHaveTextContent("line one"));
    expect(items()[0]!.textContent).toBe("line one\nline two");
    expect(box).toHaveValue("");
  });

  it("ignores blank messages", async () => {
    signInMock();
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    expect(await screen.findByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByLabelText("Message"), "   {Enter}");

    expect(items()).toHaveLength(0);
  });

  it("shows a counter near the limit and blocks Send over it", async () => {
    signInMock();
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    const box = await screen.findByLabelText("Message");

    expect(screen.queryByText(new RegExp(`/${MESSAGE_CONTENT_MAX}`))).not.toBeInTheDocument();
    await user.click(box);
    await user.paste("a".repeat(3600));
    expect(screen.getByText(`3600/${MESSAGE_CONTENT_MAX}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();

    await user.paste("a".repeat(500));
    expect(screen.getByText(/4100\/4000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(items()).toHaveLength(0);
  });

  it("disables Reset conversation while a stream runs", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 60 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Hi");

    await waitFor(() => expect(screen.getByRole("button", { name: "Reset conversation" })).toBeDisabled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Reset conversation" })).toBeEnabled());
  });
});

describe("pre-stream errors", () => {
  it("shows STREAM_IN_PROGRESS inline and restores the text", async () => {
    signInMock();
    mockStore.openStreams.add(EV);
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Too soon");

    const alert = await screen.findByRole("alert", { name: "" });
    expect(alert).toHaveTextContent("An answer is already being generated.");
    expect(screen.getByLabelText("Message")).toHaveValue("Too soon");
    expect(items()).toHaveLength(0);
  });

  it("shows AI_UNAVAILABLE inline", async () => {
    signInMock();
    setStreamScenario({ kind: "pre-stream-error", status: 503, code: ErrorCode.AI_UNAVAILABLE });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Anyone there?");

    expect(
      await screen.findByText("The AI provider isn't reachable right now. Check the server configuration."),
    ).toBeInTheDocument();
    expect(items()).toHaveLength(0);
  });
});

describe("stream that closes without a final event", () => {
  it("marks the assistant message as an INTERNAL_ERROR locally", async () => {
    signInMock();
    const conversation = mockStore.conversations.get(EV)!;
    server.use(
      route("sendMessage", () => {
        const assistantMessage = buildMessage(conversation.id, {
          role: "assistant",
          content: "",
          status: "streaming",
        });
        // What a crashed server would have saved, so the follow-up refetch agrees.
        conversation.messages.push({
          ...assistantMessage,
          content: "cut off",
          status: "error",
          errorCode: ErrorCode.INTERNAL_ERROR,
        });
        const frames = [
          encodeSseEvent({ type: "message.created", userMessage: null, assistantMessage }),
          encodeSseEvent({ type: "token", messageId: assistantMessage.id, delta: "cut off" }),
        ];
        return new Response(frames.join(""), {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Hello");

    await waitFor(() => expect(items().at(-1)).toHaveAttribute("data-status", "error"));
    expect(items().at(-1)).toHaveTextContent("cut off");
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(messageBox()).toBeEnabled();
  });
});
