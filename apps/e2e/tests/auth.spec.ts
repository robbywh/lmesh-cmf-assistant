import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { LoginPage, SEED_EMAIL, SEED_PASSWORD } from "../pages/login.page.js";

// Sign-in is rate limited (5 per 60 s per IP): keep to one attempt per test.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ retries: 0 });

test.describe("authentication", () => {
  test("redirects to login, returns after sign-in, and signs out", async ({
    page,
  }) => {
    const login = new LoginPage(page);
    const path = `/projects/${randomUUID()}`;

    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?redirect=${encodeURIComponent(path)}$`),
    );
    await expect(login.submit).toBeVisible();

    await login.signIn(SEED_EMAIL, SEED_PASSWORD);
    await expect(page).toHaveURL(new RegExp(`${path}$`));

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(login.submit).toBeVisible();
  });

  test("shows a generic error for a wrong password", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.signIn(SEED_EMAIL, `wrong-${Date.now()}`);

    await expect(login.error).toContainText("Invalid email or password");
    await expect(page).toHaveURL(/\/login/);
  });
});
