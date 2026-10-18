import { AI_TIMEOUT, ProjectPage } from "../pages/project.page.js";
import { expect, test } from "../fixtures/test.js";

test.describe("summary and reset", () => {
  test("summarises a conversation and keeps the summary after reload", async ({
    page,
    projects,
  }) => {
    test.setTimeout(150_000);
    const chat = new ProjectPage(page);
    const project = await projects.create();

    await chat.goto(project.id);
    await expect(chat.summariseButton).toBeDisabled();
    await chat.send("Suggest one material for the seats.");
    await expect(chat.messages.nth(1)).toHaveAttribute(
      "data-status",
      "complete",
      {
        timeout: AI_TIMEOUT,
      },
    );

    await expect(chat.summariseButton).toBeEnabled();
    await chat.summariseButton.click();

    const summary = chat.messages.and(page.locator('[data-kind="summary"]'));
    await expect(summary).toHaveCount(1);
    await expect(summary).toHaveAttribute("data-status", "complete", {
      timeout: AI_TIMEOUT,
    });
    await expect(
      summary.getByRole("heading", { name: "Summary" }),
    ).toBeVisible();
    expect((await chat.bodyText(summary)).length).toBeGreaterThan(
      "Summary".length,
    );

    await page.reload();
    await expect(summary).toHaveCount(1);
    await expect(summary).toHaveAttribute("data-status", "complete");
  });

  test("resets the conversation and keeps the project", async ({
    page,
    projects,
  }) => {
    test.setTimeout(120_000);
    const chat = new ProjectPage(page);
    const project = await projects.create();

    await chat.goto(project.id);
    await chat.send("Suggest one colour for the headliner.");
    await expect(chat.messages.nth(1)).toHaveAttribute(
      "data-status",
      "complete",
      {
        timeout: AI_TIMEOUT,
      },
    );

    await chat.resetButton.click();
    await page
      .getByRole("dialog", { name: "Reset conversation" })
      .getByRole("button", { name: "Reset", exact: true })
      .click();

    await expect(chat.messages).toHaveCount(0);
    await expect(chat.emptyState).toBeVisible();
    await expect(chat.heading).toHaveText(project.title);
    await expect(chat.sidebarLink(project.title)).toBeVisible();
  });
});
