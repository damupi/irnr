import { expect, test } from "@playwright/test";
import path from "node:path";

test.describe.serial("Configuración", () => {
  test("edita el valor catastral de un año", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByLabel("VC suelo 2026").fill("9000,00");
    await page.getByRole("button", { name: "Guardar 2026" }).click();
    await expect(page.getByText("Guardado")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("VC suelo 2026")).toHaveValue("9.000,00");
  });

  test("crea un contrato", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByLabel("Inquilino", { exact: true }).fill("Inquilino E2E");
    await page.getByLabel("Inicio", { exact: true }).fill("2027-02-01");
    await page.getByLabel("Renta mensual (€)").fill("1.000,00");
    await page.getByRole("button", { name: "Añadir contrato" }).click();
    await expect(page.getByRole("row", { name: /Inquilino E2E/ })).toContainText("1.000,00");
  });

  test("crea una declaración con adjunto", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByLabel("Ejercicio declaración").fill("2022");
    await page.getByLabel("Tipo de renta").selectOption("02");
    await page.getByLabel("Fecha de presentación").fill("2023-06-01");
    await page.locator('#filing-form input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "factura.pdf"));
    await page.getByRole("button", { name: "Añadir declaración" }).click();
    const r = page.getByRole("row", { name: /2022/ });
    await expect(r).toContainText("📎 1");
  });

  test("crea una categoría y no deja borrar una en uso", async ({ page }) => {
    await page.goto("/configuracion");
    await page.getByLabel("Categoría 1", { exact: true }).fill("gastos");
    await page.getByLabel("Categoría 2", { exact: true }).fill("cerrajeria e2e");
    await page.getByLabel("Tratamiento").selectOption("capped_1_4");
    await page.getByRole("button", { name: "Añadir categoría" }).click();
    await expect(page.getByRole("row", { name: /cerrajeria e2e/ })).toBeVisible();

    await page.getByRole("button", { name: "Borrar gastos / seguros" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await expect(page.getByText(/en uso/)).toBeVisible();

    await page.getByRole("button", { name: "Borrar gastos / cerrajeria e2e" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Borrar" }).click();
    await expect(page.getByRole("row", { name: /cerrajeria e2e/ })).toHaveCount(0);
  });
});
