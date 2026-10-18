import { HealthSchema } from "@lmesh/api-contract";
import { expect, test } from "@playwright/test";

import { LoginPage } from "../pages/login.page.js";

test.describe("smoke", () => {
  test("serves the SPA shell", async ({ request }) => {
    const response = await request.get("/");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(await response.text()).toContain('<div id="root"');
  });

  test("proxies the health endpoint to the backend", async ({ request }) => {
    const response = await request.get("/api/v1/health");

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { data: unknown };
    expect(HealthSchema.parse(body.data).status).toBe("ok");
  });

  test("renders the login form", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.email).toBeVisible();
    await expect(login.password).toBeVisible();
    await expect(login.submit).toBeVisible();
  });
});
