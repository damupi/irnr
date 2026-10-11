import { expect, test } from "@playwright/test";

test.describe("sistema en oscuro", () => {
  test.use({ colorScheme: "dark" });

  test("aplica el tema del sistema y el icono ofrece volver a claro", async ({ page }) => {
    await page.goto("/guia");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Cambiar a tema claro" })).toBeVisible();
  });

  test("el toggle cambia a claro y la elección se recuerda", async ({ page }) => {
    await page.goto("/guia");
    await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Cambiar a tema oscuro" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("sistema en claro", () => {
  test.use({ colorScheme: "light" });

  test("aplica claro y el toggle pasa a oscuro", async ({ page }) => {
    await page.goto("/guia");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
