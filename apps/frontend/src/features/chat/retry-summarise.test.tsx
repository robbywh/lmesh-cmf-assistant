import { ErrorCode } from "@lmesh/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SEED_PROJECT_IDS, buildMessage } from "@/mocks/fixtures";
import { ok, route } from "@/mocks/handlers";
import { mockStore, setStreamScenario, signInMock } from "@/mocks/mock-store";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

const EV = SEED_PROJECT_IDS.ev;
const SUV = SEED_PROJECT_IDS.suv;

const items = () => screen.queryAllByTestId("message-item");
const summariseButton = () => screen.getByRole("button", { name: "Summarise" });

async function typeAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(await screen.findByLabelText("Message"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

function seedErrorThenRetryable(status: "error" | "aborted") {
  const conversation = mockStore.conversations.get(EV)!;
  conversation.messages = [
    buildMessage(conversation.id, { role: "user", content: "question" }),
    buildMessage(conversation.id, {
      role: "assistant",
      content: "partial answ",
      status,
      errorCode: status === "error" ? ErrorCode.AI_PROVIDER_ERROR : null,
    }),
  ];
}

describe("retry", () => {
  it("streams into the same message item after an error and ends complete", async () => {
    signInMock();
    setStreamScenario({ kind: "error-midstream", code: ErrorCode.AI_TIMEOUT });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await typeAndSend(user, "Will fail");
    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("The assistant took too long to respond.")).toBeInTheDocument();
    expect(items()[1]).toHaveTextContent("Warm");
    const row = items()[1];

    setStreamScenario({ kind: "success", tokenDelayMs: 40 });
    await user.click(within(row!).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "streaming"));
    expect(items()).toHaveLength(2);
    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(2);
    expect(items()[1]).toBe(row);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("The assistant took too long to respond.")).not.toBeInTheDocument();
  });

  it("retries an aborted message", async () => {
    signInMock();
    seedErrorThenRetryable("aborted");
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(2);
    expect(screen.queryByText("Stopped")).not.toBeInTheDocument();
  });

  it("shows pre-stream errors inline and keeps the message retryable", async () => {
    signInMock();
    seedErrorThenRetryable("error");
    setStreamScenario({ kind: "pre-stream-error", status: 503, code: ErrorCode.AI_UNAVAILABLE });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("The AI provider isn't reachable right now. Check the server configuration."),
    ).toBeInTheDocument();
    expect(items()[1]).toHaveAttribute("data-status", "error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("shows STREAM_IN_PROGRESS inline when the server is busy", async () => {
    signInMock();
    seedErrorThenRetryable("error");
    mockStore.openStreams.add(EV);
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("An answer is already being generated.")).toBeInTheDocument();
  });
});

describe("summarise", () => {
  it("is disabled until there is a completed assistant reply", async () => {
    signInMock();
    const conversation = mockStore.conversations.get(EV)!;
    conversation.messages = [buildMessage(conversation.id, { role: "user", content: "hello" })];
    renderApp(`/projects/${EV}`);

    await screen.findByRole("heading", { level: 1 });
    expect(summariseButton()).toBeDisabled();
  });

  it("is enabled with an assistant reply and streams a Summary card", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 40 });
    renderApp(`/projects/${SUV}`);
    const user = userEvent.setup();
    await screen.findAllByTestId("message-item");
    expect(summariseButton()).toBeEnabled();

    await user.click(summariseButton());

    await waitFor(() => expect(items()).toHaveLength(6));
    const card = items()[5]!;
    expect(card).toHaveAttribute("data-kind", "summary");
    expect(card).toHaveAttribute("data-status", "streaming");
    expect(within(card).getByRole("region", { name: "Summary" })).toBeInTheDocument();
    expect(summariseButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset conversation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    await waitFor(() => expect(items()[5]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(6);
    expect(items()[5]).toHaveTextContent("matte cognac leather with satin walnut trim.");
    expect(summariseButton()).toBeEnabled();
  });

  it("shows a failed summary with the error, then retries it in place", async () => {
    signInMock();
    setStreamScenario({ kind: "error-midstream", code: ErrorCode.AI_PROVIDER_ERROR });
    renderApp(`/projects/${SUV}`);
    const user = userEvent.setup();
    await screen.findAllByTestId("message-item");

    await user.click(summariseButton());

    await waitFor(() => expect(items()[5]).toHaveAttribute("data-status", "error"));
    expect(items()[5]).toHaveAttribute("data-kind", "summary");
    expect(screen.getByText("The AI provider returned an error. Please try again.")).toBeInTheDocument();

    setStreamScenario(null);
    await user.click(within(items()[5]!).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(items()[5]).toHaveAttribute("data-status", "complete"));
    expect(items()).toHaveLength(6);
    expect(items()[5]).toHaveAttribute("data-kind", "summary");
  });

  it("shows 503 AI_UNAVAILABLE and 409 STREAM_IN_PROGRESS inline", async () => {
    signInMock();
    setStreamScenario({ kind: "pre-stream-error", status: 503, code: ErrorCode.AI_UNAVAILABLE });
    renderApp(`/projects/${SUV}`);
    const user = userEvent.setup();
    await screen.findAllByTestId("message-item");

    await user.click(summariseButton());
    expect(
      await screen.findByText("The AI provider isn't reachable right now. Check the server configuration."),
    ).toBeInTheDocument();

    setStreamScenario(null);
    mockStore.openStreams.add(SUV);
    await user.click(summariseButton());
    expect(await screen.findByText("An answer is already being generated.")).toBeInTheDocument();
    expect(items()).toHaveLength(5);
  });
});

describe("stop resync", () => {
  it("does not let a server row that is still streaming undo the aborted state", async () => {
    signInMock();
    setStreamScenario({ kind: "success", tokenDelayMs: 100 });
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();
    await screen.findByLabelText("Message");

    let calls = 0;
    server.use(
      route("getActiveConversation", () => {
        calls += 1;
        const conversation = structuredClone(mockStore.conversations.get(EV)!);
        const last = conversation.messages.at(-1)!;
        last.status = calls === 1 ? "streaming" : "aborted";
        return ok(conversation);
      }),
    );

    await typeAndSend(user, "Stop me");
    await waitFor(() => expect(items()[1]!.textContent).toContain("Warm"));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(items()[1]).toHaveAttribute("data-status", "aborted");

    await waitFor(() => expect(calls).toBe(1), { timeout: 2000 });
    expect(items()[1]).toHaveAttribute("data-status", "aborted");
    expect(screen.getByText("Stopped")).toBeInTheDocument();

    await waitFor(() => expect(calls).toBe(2), { timeout: 3000 });
    await waitFor(() => expect(items()[1]).toHaveAttribute("data-status", "aborted"));
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  }, 10_000);
});
