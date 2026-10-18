import type { Locator, Page } from "@playwright/test";

/** Generous bound for steps that wait on the real AI (matches AI_REQUEST_TIMEOUT_MS). */
export const AI_TIMEOUT = 60_000;

/** The `/projects/:id` chat screen (FSD 6.3, 6.4). */
export class ProjectPage {
  readonly sidebar: Locator;
  readonly projectList: Locator;
  readonly heading: Locator;
  readonly emptyState: Locator;
  readonly messages: Locator;
  readonly assistantMessages: Locator;
  readonly streamingIndicator: Locator;
  readonly composer: Locator;
  readonly stopButton: Locator;
  readonly summariseButton: Locator;
  readonly resetButton: Locator;

  constructor(readonly page: Page) {
    this.sidebar = page.getByRole("complementary", { name: "Sidebar" });
    this.projectList = page.getByTestId("project-list");
    this.heading = page.getByRole("heading", { level: 1 });
    this.emptyState = page.getByRole("heading", {
      name: "Start the conversation",
    });
    this.messages = page.getByTestId("message-item");
    this.assistantMessages = this.messages.and(
      page.locator('[data-role="assistant"]'),
    );
    this.streamingIndicator = page.getByTestId("streaming-indicator");
    this.composer = page.getByLabel("Message", { exact: true });
    this.stopButton = page.getByRole("button", { name: "Stop" });
    this.summariseButton = page.getByRole("button", {
      name: "Summarise",
      exact: true,
    });
    this.resetButton = page.getByRole("button", {
      name: "Reset conversation",
      exact: true,
    });
  }

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
  }

  /** Types into the composer and presses Enter. */
  async send(text: string): Promise<void> {
    await this.composer.fill(text);
    await this.composer.press("Enter");
  }

  sidebarLink(title: string): Locator {
    return this.projectList.getByRole("link", { name: title });
  }

  /** Text a user would read in an assistant message, without the alert, Retry or Stopped chrome. */
  async bodyText(message: Locator): Promise<string> {
    return message.evaluate((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll(
          '[role="alert"], button, [data-testid="streaming-indicator"]',
        )
        .forEach((node) => node.remove());
      return (clone.textContent ?? "").replace("Stopped", "").trim();
    });
  }

  /**
   * Every `data-status` the message shows during `durationMs`.
   *
   * The fixed window is deliberate: it proves a status never flips back (for
   * example aborted -> streaming) after the UI has settled, which polling
   * cannot show because a poll succeeds on its first matching read. Changes are
   * recorded by a MutationObserver in the page; this is not a sleep.
   */
  async statusesDuring(
    message: Locator,
    durationMs: number,
  ): Promise<string[]> {
    return message.evaluate(
      (element, duration) =>
        new Promise<string[]>((resolve) => {
          const seen = [element.getAttribute("data-status") ?? ""];
          const observer = new MutationObserver(() =>
            seen.push(element.getAttribute("data-status") ?? ""),
          );
          observer.observe(element, {
            attributes: true,
            attributeFilter: ["data-status"],
          });
          setTimeout(() => {
            observer.disconnect();
            resolve(seen);
          }, duration);
        }),
      durationMs,
    );
  }
}
