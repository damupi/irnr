import { expect, test } from "@playwright/test";

test("KPIs del ejercicio por defecto (2025) con hoy fijado a 2026-10-10", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Ejercicio 2025/ })).toBeVisible();
  await expect(page.getByTestId("kpi-ingresos")).toContainText("9.360,00");
  await expect(page.getByTestId("kpi-dias")).toContainText("365");
});

test("tarjetas de ejercicios con su estado", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("year-2023")).toContainText("Presentado");
  await expect(page.getByTestId("year-2024")).toContainText("Presentado fuera de plazo");
  await expect(page.getByTestId("year-2025")).toContainText("Vencido");
  await expect(page.getByTestId("year-2026")).toContainText("Futuro");
});

test("la alerta de sin categoría abre Movimientos filtrado", async ({ page }) => {
  await page.goto("/?year=2025");
  await page.getByRole("link", { name: /movimientos? sin categoría/ }).click();
  await expect(page).toHaveURL(/\/movimientos\?year=2025&uncategorized=1/);
  await expect(page.getByRole("row", { name: /Demo antena/ })).toBeVisible();
});
