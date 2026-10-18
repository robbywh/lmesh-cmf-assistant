import { expect, test as setup } from "@playwright/test";

import { STORAGE_STATE } from "../fixtures/paths.js";
import { LoginPage, SEED_EMAIL, SEED_PASSWORD } from "../pages/login.page.js";

setup("sign in as the seed user", async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn(SEED_EMAIL, SEED_PASSWORD);

  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page
      .getByRole("complementary", { name: "Sidebar" })
      .getByRole("button", { name: "New project" }),
  ).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
