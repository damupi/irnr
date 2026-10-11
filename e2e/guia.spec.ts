import { expect, test } from "@playwright/test";

test("la guía carga y menciona el tipo del 19 %", async ({ page }) => {
  await page.goto("/guia");
  await expect(page.getByRole("heading", { name: "Guía fiscal" })).toBeVisible();
  await expect(page.locator("body")).toContainText("19 %");
});
