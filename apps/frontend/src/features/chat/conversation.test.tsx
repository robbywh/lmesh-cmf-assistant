import { ErrorCode, type Message } from "@lmesh/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SEED_PROJECT_IDS, buildMessage } from "@/mocks/fixtures";
import { errorHandler, route } from "@/mocks/handlers";
import { mockStore, signInMock } from "@/mocks/mock-store";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

import { useComposerDraftStore } from "./composer-draft.store";

const EV = SEED_PROJECT_IDS.ev;
const EV_TITLE = "Urban EV compact: recycled textiles";

function setMessages(projectId: string, build: (conversationId: string) => Message[]) {
  const conversation = mockStore.conversations.get(projectId)!;
  conversation.messages = build(conversation.id);
}

afterEach(() => {
  vi.unstubAllGlobals();
  useComposerDraftStore.setState({ drafts: {} });
});

describe("message list", () => {
  it("renders messages in order with test ids and a Summary card", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.suv}`);

    const items = await screen.findAllByTestId("message-item");

    expect(items.map((item) => `${item.dataset.role}:${item.dataset.kind}:${item.dataset.status}`)).toEqual([
      "user:chat:complete",
      "assistant:chat:complete",
      "user:chat:complete",
      "assistant:chat:complete",
      "assistant:summary:complete",
    ]);
    expect(screen.getByRole("log", { name: "Conversation" })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(summary).toHaveTextContent("matte cognac leather");
  });

  it("preserves line breaks in user messages", async () => {
    signInMock();
    setMessages(EV, (id) => [buildMessage(id, { role: "user", content: "line one\nline two" })]);
    renderApp(`/projects/${EV}`);

    const text = await screen.findByText(/line one/);
    expect(text).toHaveClass("whitespace-pre-wrap");
  });

  it("renders Markdown lists and tables but never raw HTML", async () => {
    signInMock();
    setMessages(EV, (id) => [
      buildMessage(id, {
        role: "assistant",
        content: [
          "- first option",
          "- second option",
          "",
          "| Material | Finish |",
          "| --- | --- |",
          "| Wool | Matte |",
          "",
          "<script>alert(1)</script>",
          "",
          "<img src=x onerror=alert(1)>",
          "",
          "![tracking pixel](https://evil.example/p.png)",
          "",
          "[docs](https://example.com)",
        ].join("\n"),
      }),
    ]);
    renderApp(`/projects/${EV}`);

    const log = await screen.findByRole("log");
    expect(within(log).getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining(["first option", "second option"]),
    );
    expect(within(log).getByRole("table")).toBeInTheDocument();
    expect(within(log).getByRole("cell", { name: "Wool" })).toBeInTheDocument();
    expect(log.querySelector("script")).toBeNull();
    expect(log.querySelector("img")).toBeNull();
    expect(log.querySelector("[onerror]")).toBeNull();
    const link = within(log).getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows friendly error text and Retry only on the last assistant message", async () => {
    signInMock();
    setMessages(EV, (id) => [
      buildMessage(id, { role: "user", content: "first" }),
      buildMessage(id, {
        role: "assistant",
        content: "partial one",
        status: "error",
        errorCode: ErrorCode.AI_BAD_RESPONSE,
      }),
      buildMessage(id, { role: "user", content: "second" }),
      buildMessage(id, {
        role: "assistant",
        content: "partial two",
        status: "error",
        errorCode: ErrorCode.AI_TIMEOUT,
      }),
    ]);
    renderApp(`/projects/${EV}`);

    expect(await screen.findByText("The assistant took too long to respond.")).toBeInTheDocument();
    expect(screen.getByText("The assistant's reply couldn't be read. Please try again.")).toBeInTheDocument();
    expect(screen.getByText("partial two")).toBeInTheDocument();
    const retryButtons = screen.getAllByRole("button", { name: "Retry" });
    expect(retryButtons).toHaveLength(1);
    const items = screen.getAllByTestId("message-item");
    expect(within(items[3]!).getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows Stopped for an aborted message and a thinking indicator for a streaming one", async () => {
    signInMock();
    setMessages(EV, (id) => [
      buildMessage(id, { role: "assistant", content: "half an answ", status: "aborted" }),
      buildMessage(id, { role: "assistant", content: "", status: "streaming" }),
    ]);
    renderApp(`/projects/${EV}`);

    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByTestId("streaming-indicator")).toHaveTextContent("Assistant is thinking…");
  });
});

describe("empty state", () => {
  it("offers three prompts built from the project and fills the composer on click", async () => {
    signInMock();
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    const prompts = await screen.findAllByRole("button", { name: /CMF themes|materials fit|finishes would/ });
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toHaveTextContent(`Suggest three CMF themes for ${EV_TITLE}`);

    await user.click(prompts[0]!);

    expect(screen.getByLabelText("Message")).toHaveValue(`Suggest three CMF themes for ${EV_TITLE}`);
    expect(useComposerDraftStore.getState().drafts[EV]).toBe("");
  });
});

describe("reset conversation", () => {
  it("shows the empty state with the header unchanged", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.suv}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Reset conversation" }));
    const dialog = await screen.findByRole("dialog", { name: "Reset conversation" });
    expect(dialog).toHaveTextContent(
      "Start a new conversation? The current one will be archived and the AI will no longer see it.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));

    expect(await screen.findByText("Start the conversation")).toBeInTheDocument();
    expect(screen.queryByTestId("message-item")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Premium SUV interior: warm earth" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Conversation reset")).toBeInTheDocument();
  });

  it("shows a toast when a stream is in progress", async () => {
    signInMock();
    server.use(errorHandler("resetConversation", 409, ErrorCode.STREAM_IN_PROGRESS));
    renderApp(`/projects/${SEED_PROJECT_IDS.suv}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Reset conversation" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));

    expect(await screen.findByText("An answer is already being generated.")).toBeInTheDocument();
    expect(screen.getAllByTestId("message-item")).toHaveLength(5);
  });
});

describe("project page states", () => {
  it("shows the not-found view for an unknown project", async () => {
    signInMock();
    renderApp("/projects/b0000000-0000-4000-8000-0000000000ff");

    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to projects" })).toBeInTheDocument();
  });

  it("renders a revisited project from cache without skeletons", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.suv}`);
    const user = userEvent.setup();
    await screen.findAllByTestId("message-item");

    await user.click(screen.getByRole("link", { name: /Sports coupe/ }));
    await screen.findByRole("heading", { level: 1, name: "Sports coupe: dark technical" });

    // Even if the network hangs, a cached project must render immediately.
    server.use(
      route("getProject", () => new Promise<never>(() => undefined)),
      route("getActiveConversation", () => new Promise<never>(() => undefined)),
    );
    await user.click(screen.getByRole("link", { name: /Premium SUV/ }));

    expect(await screen.findAllByTestId("message-item")).toHaveLength(5);
    expect(screen.queryByRole("status", { name: "Loading project" })).not.toBeInTheDocument();
  });
});

describe("narrow header", () => {
  it("moves Edit, Delete and Reset into a Project actions menu", async () => {
    signInMock();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    renderApp(`/projects/${EV}`);
    const user = userEvent.setup();

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Project actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(EV_TITLE));
  });
});
