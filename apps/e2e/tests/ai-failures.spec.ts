import { AI_TIMEOUT, ProjectPage } from "../pages/project.page.js";
import { expect, test } from "../fixtures/test.js";

// Needs the e2e stack (AI_FAULT_INJECTION=true):
//   docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build -d
// Every other message in these tests goes to the real model.
test.describe("AI failure paths (fault injection)", () => {
  test.setTimeout(120_000);

  async function sendFault(
    chat: ProjectPage,
    projectId: string,
    marker: string,
  ) {
    await chat.goto(projectId);
    await chat.send(`${marker} Suggest a colour for the doors.`);
    return chat.messages.nth(1);
  }

  /** Retry must re-run the same assistant message in place, not append a new one. */
  async function retryToCompletion(
    chat: ProjectPage,
    reply: ReturnType<ProjectPage["messages"]["nth"]>,
  ) {
    // Tag the failed element: a remount (new message id) would drop the tag.
    await reply.evaluate((element) =>
      element.setAttribute("data-e2e-retried", ""),
    );
    const retried = chat.page.locator("[data-e2e-retried]");

    await reply.getByRole("button", { name: "Retry" }).click();
    await expect(chat.messages).toHaveCount(2);
    await expect(retried).toHaveAttribute("data-status", "complete", {
      timeout: AI_TIMEOUT,
    });
    await expect(chat.messages).toHaveCount(2);
    await expect(retried).toHaveCount(1);
    await expect(retried.getByRole("alert")).toHaveCount(0);
    await expect(chat.composer).toBeEnabled();
  }

  test("timeout shows a friendly error and Retry succeeds", async ({
    page,
    projects,
  }) => {
    const chat = new ProjectPage(page);
    const project = await projects.create();

    const reply = await sendFault(chat, project.id, "[[e2e-fault:timeout]]");

    await expect(reply).toHaveAttribute("data-status", "error", {
      timeout: AI_TIMEOUT,
    });
    await expect(reply.getByRole("alert")).toContainText("took too long");
    await retryToCompletion(chat, reply);
  });

  test("mid-stream error keeps the partial text and Retry succeeds", async ({
    page,
    projects,
  }) => {
    const chat = new ProjectPage(page);
    const project = await projects.create();

    const reply = await sendFault(
      chat,
      project.id,
      "[[e2e-fault:error-midstream]]",
    );

    await expect(reply).toHaveAttribute("data-status", "error", {
      timeout: AI_TIMEOUT,
    });
    await expect(reply.getByRole("alert")).toBeVisible();
    expect((await chat.bodyText(reply)).length).toBeGreaterThan(0);
    await retryToCompletion(chat, reply);
  });

  test("malformed provider output shows an error and Retry succeeds", async ({
    page,
    projects,
  }) => {
    const chat = new ProjectPage(page);
    const project = await projects.create();

    const reply = await sendFault(chat, project.id, "[[e2e-fault:malformed]]");

    await expect(reply).toHaveAttribute("data-status", "error", {
      timeout: AI_TIMEOUT,
    });
    await expect(reply.getByRole("alert")).toBeVisible();
    await retryToCompletion(chat, reply);
  });

  test("Stop on a slow stream leaves a Stopped message", async ({
    page,
    projects,
  }) => {
    const chat = new ProjectPage(page);
    const project = await projects.create();

    const reply = await sendFault(chat, project.id, "[[e2e-fault:slow]]");
    await expect
      .poll(() => chat.bodyText(reply), { timeout: AI_TIMEOUT })
      .not.toBe("");
    await chat.stopButton.click();

    await expect(reply).toHaveAttribute("data-status", "aborted");
    await expect(reply.getByText("Stopped")).toBeVisible();
    expect((await chat.bodyText(reply)).length).toBeGreaterThan(0);
    await expect(chat.composer).toBeEnabled();

    // It must not flip back to streaming once the stop has settled.
    const statuses = await chat.statusesDuring(reply, 3_000);
    expect(new Set(statuses)).toEqual(new Set(["aborted"]));
  });
});
