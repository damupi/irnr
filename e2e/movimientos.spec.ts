import { expect, test } from "@playwright/test";
import path from "node:path";

const fx = (f: string) => path.join(__dirname, "fixtures", f);
const row = (page: import("@playwright/test").Page, text: string | RegExp) => page.getByRole("row", { name: text });

test.describe.serial("Movimientos", () => {
  test("crea un gasto con 2 adjuntos y muestra badge y clip", async ({ page }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByRole("button", { name: "Nuevo movimiento" }).click();
    await page.getByLabel("Fecha", { exact: true }).fill("2025-03-01");
    await page.getByLabel("Importe").fill("235,01");
    await page.getByLabel("Concepto").fill("Seguro hogar E2E");
    await page.getByLabel("Categoría 1").selectOption("gastos");
    await page.getByLabel("Categoría 2").selectOption("seguros");
    await expect(page.getByText("Casilla 10").first()).toBeVisible(); // ayuda contextual
    await page.locator('input[type="file"]').setInputFiles([fx("factura.pdf"), fx("foto.png")]);
    await page.getByRole("button", { name: "Guardar" }).click();
    const r = row(page, /Seguro hogar E2E/);
    await expect(r).toBeVisible();
    await expect(r).toContainText("Casilla 10 · Seguros");
    await expect(r).toContainText("235,01");
    await expect(r).toContainText("📎 2");
  });

  test("descarga un adjunto con el content-type correcto", async ({ page, request }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByRole("button", { name: "Acciones de Seguro hogar E2E" }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const href = await page.locator('a[href^="/api/attachments/"]').first().getAttribute("href");
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    await page.keyboard.press("Escape");
  });

  test("filtra sin categoría y recategoriza inline", async ({ page }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByLabel("Sin categoría").check();
    await expect(page).toHaveURL(/uncategorized=1/);
    await expect(row(page, /Demo pintura/)).toBeVisible();
    await expect(row(page, /Demo antena/)).toBeVisible();
    await expect(row(page, /Seguro hogar E2E/)).toHaveCount(0);
    await page.getByLabel("Categoría de Demo pintura").selectOption({ label: "gastos / reparacion y conservacion" });
    await expect(row(page, /Demo pintura/)).toHaveCount(0);
    await expect(row(page, /Demo antena/)).toBeVisible();
  });

  test("edita el importe", async ({ page }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByRole("button", { name: "Acciones de Seguro hogar E2E" }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    await page.getByLabel("Importe").fill("250,00");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(row(page, /Seguro hogar E2E/)).toContainText("250,00");
  });

  test("genera recurrentes mensuales × 3", async ({ page }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByRole("button", { name: "Acciones de Seguro hogar E2E" }).click();
    await page.getByRole("menuitem", { name: "Generar recurrentes" }).click();
    await page.getByLabel("Periodicidad").selectOption("month");
    await page.getByLabel("Repeticiones").fill("3");
    await page.getByRole("button", { name: "Generar" }).click();
    await expect(row(page, /Seguro hogar E2E/)).toHaveCount(4);
  });

  test("duplica con la fecha de hoy", async ({ page }) => {
    await page.goto("/movimientos?year=2025");
    await page.getByRole("button", { name: "Acciones de Seguro hogar E2E" }).first().click();
    await page.getByRole("menuitem", { name: "Duplicar" }).click();
    await expect(page.getByText("Movimiento duplicado con la fecha de hoy")).toBeVisible();
    await page.goto("/movimientos?year=2026");
    await expect(row(page, /Seguro hogar E2E/)).toContainText("10/10/2026");
  });

  test("borra con confirmación", async ({ page }) => {
    await page.goto("/movimientos?year=2026");
    await page.getByRole("button", { name: "Acciones de Seguro hogar E2E" }).first().click();
    await page.getByRole("menuitem", { name: "Borrar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await expect(row(page, /Seguro hogar E2E/)).toHaveCount(0);
  });
});
