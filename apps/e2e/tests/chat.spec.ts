import { AI_TIMEOUT, ProjectPage } from "../pages/project.page.js";
import { expect, test, uniqueTitle } from "../fixtures/test.js";

test.describe("projects and chat", () => {
  test("creates a project through the dialog", async ({ page, projects }) => {
    const chat = new ProjectPage(page);
    const title = uniqueTitle("create");

    await page.goto("/projects");
    await chat.sidebar.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Title").fill(title);
    await dialog
      .getByLabel("Description")
      .fill("Warm earth tones, matte leather.");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
    projects.track(page.url().split("/").pop() ?? "");
    await expect(chat.heading).toHaveText(title);
    await expect(chat.emptyState).toBeVisible();
    await expect(chat.projectList.getByRole("link").first()).toContainText(
      title,
    );
  });

  test("shows the reply growing while it streams", async ({
    page,
    projects,
  }) => {
    // The slow marker is synthetic: tokens arrive every 500 ms, so growth is
    // observable however fast the real model is.
    test.setTimeout(120_000);
    const chat = new ProjectPage(page);
    const project = await projects.create();

    await chat.goto(project.id);
    await chat.send("[[e2e-fault:slow]] Suggest one colour direction.");

    await expect(chat.messages.first()).toHaveAttribute("data-role", "user");
    await expect(chat.streamingIndicator).toBeVisible();

    // Progressive rendering: the visible reply grows between two observations.
    const reply = chat.messages.nth(1);
    let firstLength = 0;
    await expect
      .poll(
        async () => {
          if ((await reply.getAttribute("data-status")) !== "streaming")
            return false;
          const length = (await chat.bodyText(reply)).length;
          if (firstLength === 0) firstLength = length;
          return length > firstLength;
        },
        { timeout: AI_TIMEOUT, intervals: [100] },
      )
      .toBe(true);

    await expect(reply).toHaveAttribute("data-status", "complete", {
      timeout: AI_TIMEOUT,
    });
    await expect(chat.composer).toBeEnabled();
  });

  test("gets a real reply that persists after reload", async ({
    page,
    projects,
  }) => {
    test.setTimeout(120_000);
    const chat = new ProjectPage(page);
    const project = await projects.create();

    await chat.goto(project.id);
    await chat.send("Suggest one colour direction for the dashboard.");

    await expect(chat.messages.first()).toHaveAttribute("data-role", "user");
    const reply = chat.messages.nth(1);
    await expect(reply).toHaveAttribute("data-status", "complete", {
      timeout: AI_TIMEOUT,
    });
    expect((await chat.bodyText(reply)).length).toBeGreaterThan(0);
    await expect(chat.composer).toBeEnabled();

    await page.reload();
    await expect(chat.messages).toHaveCount(2);
    await expect(chat.messages.nth(1)).toHaveAttribute(
      "data-status",
      "complete",
    );
    expect((await chat.bodyText(chat.messages.nth(1))).length).toBeGreaterThan(
      0,
    );
  });

  test("keeps the stream running when navigating to another project and back", async ({
    page,
    projects,
  }) => {
    test.setTimeout(120_000);
    const chat = new ProjectPage(page);
    const first = await projects.create();
    const second = await projects.create();

    await chat.goto(first.id);
    await chat.send("[[e2e-fault:slow]] Describe a glossy finish.");
    await expect(chat.messages.nth(1)).toHaveAttribute(
      "data-status",
      "streaming",
    );

    await chat.sidebarLink(second.title).click();
    await expect(chat.heading).toHaveText(second.title);
    await expect(chat.messages).toHaveCount(0);

    await chat.sidebarLink(first.title).click();
    await expect(chat.heading).toHaveText(first.title);
    await expect(chat.messages).toHaveCount(2);
    await expect(chat.messages.nth(1)).toHaveAttribute(
      "data-status",
      "complete",
      {
        timeout: AI_TIMEOUT,
      },
    );
    await expect(chat.messages).toHaveCount(2);
  });
});
