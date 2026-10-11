import { expect, test } from "@playwright/test";

test("2024 muestra las 17 casillas, imputada y comparativa", async ({ page }) => {
  await page.goto("/declaracion/2024");
  for (let i = 1; i <= 17; i++) await expect(page.getByTestId(`box-${i}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Renta imputada/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Comparativa con lo presentado/ })).toBeVisible();
  await expect(page.getByTestId("box-1")).toContainText("1.544,58");
});

test("expandir una casilla lista sus movimientos", async ({ page }) => {
  await page.goto("/declaracion/2024");
  await page.getByTestId("box-10").getByRole("button").click();
  await expect(page.getByTestId("box-10")).toContainText("Demo seguro hogar");
});

test("sin días imputados no hay bloque de renta imputada", async ({ page }) => {
  await page.goto("/declaracion/2025");
  await expect(page.getByRole("heading", { name: /Renta imputada/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Comparativa con lo presentado/ })).toHaveCount(0);
});

test("exporta CSV", async ({ page }) => {
  await page.goto("/declaracion/2024");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar CSV del anexo" }).click()]);
  expect(download.suggestedFilename()).toBe("anexo-2024.csv");
});
