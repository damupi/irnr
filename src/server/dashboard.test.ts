import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { transactions } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { TODAY, seedScenario } from "./__fixtures__/scenario";
import { findCategory, seedCategories } from "./categories";
import { getAlerts } from "./dashboard";
import { createFiling } from "./filings";
import { saveProperty, upsertYearParams } from "./properties";
import { createRentalPeriod } from "./rentals";
import { createTransaction } from "./transactions";

const codes = (db: ReturnType<typeof createTestDb>, year: number, today = TODAY) => getAlerts(db, year, today).map((a) => a.code);
const find = (db: ReturnType<typeof createTestDb>, year: number, code: string, today = TODAY) => getAlerts(db, year, today).find((a) => a.code === code);
const exp = (db: ReturnType<typeof createTestDb>, date: string, concept: string, cat2: string, extra = {}) =>
  createTransaction(db, { date, kind: "expense", amountCents: 10_000, concept, categoryId: findCategory(db, "gastos", cat2)!.id, hasInvoice: true, ...extra });

describe("alertas de calidad de datos", () => {
  it("sin categoría", () => {
    const db = createTestDb();
    seedScenario(db);
    expect(codes(db, 2024)).not.toContain("uncategorized");
    createTransaction(db, { date: "2024-05-01", kind: "expense", amountCents: 100, concept: "Pintura" });
    expect(find(db, 2024, "uncategorized")).toMatchObject({ count: 1, href: "/movimientos?year=2024&uncategorized=1" });
  });

  it("gastos deducibles sin factura", () => {
    const db = createTestDb();
    seedScenario(db);
    expect(codes(db, 2024)).not.toContain("no_invoice");
    exp(db, "2024-05-01", "Sin factura", "comunidad", { hasInvoice: false });
    expect(find(db, 2024, "no_invoice")).toMatchObject({ count: 1, href: "/movimientos?year=2024&noInvoice=1" });
  });

  it("gastos deducibles sin adjunto (solo deducibles)", () => {
    const db = createTestDb();
    seedScenario(db);
    // 2024: 12 intereses (capped) sin adjunto; los muebles son de 2023
    expect(find(db, 2024, "no_attachment")).toMatchObject({ count: 12, href: "/movimientos?year=2024&noAttachment=1" });
    createTransaction(db, { date: "2024-05-01", kind: "expense", amountCents: 1, concept: "x", categoryId: findCategory(db, "no deducible", "otros")!.id });
    expect(find(db, 2024, "no_attachment")!.count).toBe(12);
    expect(codes(db, 2022)).not.toContain("no_attachment");
  });
});

describe("alertas de ingresos", () => {
  it("contrato vigente sin ningún ingreso registrado", () => {
    const db = createTestDb();
    seedCategories(db);
    saveProperty(db, { alias: "V", acquisitionDate: "2023-10-02" });
    upsertYearParams(db, { year: 2025, cadastralLandCents: 1, cadastralBuildingCents: 1 });
    createRentalPeriod(db, { startDate: "2024-02-01", endDate: "2026-01-31", monthlyRentCents: 78_000 });
    expect(codes(db, 2025)).toContain("no_income");
    expect(codes(db, 2025)).not.toContain("missing_rent_months");
  });

  it("meses con contrato y sin renta registrada", () => {
    const db = createTestDb();
    seedScenario(db);
    expect(codes(db, 2025)).not.toContain("missing_rent_months");
    expect(codes(db, 2025)).not.toContain("no_income");
    db.delete(transactions).where(eq(transactions.externalKey, `rental:1:2025-06`)).run();
    const a = find(db, 2025, "missing_rent_months")!;
    expect(a.message).toContain("2025-06");
    expect(a.count).toBe(1);
  });

  it("no avisa de meses futuros ni sin contrato", () => {
    const db = createTestDb();
    seedScenario(db);
    expect(codes(db, 2026)).not.toContain("missing_rent_months"); // nov/dic 2026 aún no han llegado
    expect(codes(db, 2024)).not.toContain("missing_rent_months"); // enero 2024 sin contrato
  });
});

describe("recurrentes que faltan", () => {
  it("seguro anual de 2024 sin equivalente en 2025", () => {
    const db = createTestDb();
    seedScenario(db);
    exp(db, "2024-03-01", "Seguro hogar", "seguros", { frequency: "anual" });
    expect(codes(db, 2024)).not.toContain("missing_recurring");
    const a = find(db, 2025, "missing_recurring")!;
    expect(a.message).toContain("Seguro hogar");
    exp(db, "2025-03-01", "seguro hogar", "seguros", { frequency: "anual" });
    expect(codes(db, 2025)).not.toContain("missing_recurring");
  });

  it("comunidad trimestral con 3 de 4 trimestres", () => {
    const db = createTestDb();
    seedScenario(db);
    for (const m of ["01", "04", "07"]) exp(db, `2025-${m}-10`, "Comunidad", "comunidad", { frequency: "trimestral" });
    expect(find(db, 2025, "missing_recurring")!.message).toContain("Comunidad");
    exp(db, "2025-10-10", "Comunidad", "comunidad", { frequency: "trimestral" });
    expect(codes(db, 2025)).not.toContain("missing_recurring");
  });

  it("año en curso: solo lo ya devengado", () => {
    const db = createTestDb();
    seedScenario(db);
    for (const m of ["01", "04", "07"]) exp(db, `2026-${m}-10`, "Comunidad", "comunidad", { frequency: "trimestral" });
    expect(codes(db, 2026, "2026-10-10")).toContain("missing_recurring");
    exp(db, "2026-10-10", "Comunidad", "comunidad", { frequency: "trimestral" });
    expect(codes(db, 2026, "2026-10-10")).not.toContain("missing_recurring");
    for (let m = 1; m <= 9; m++) exp(db, `2026-${String(m).padStart(2, "0")}-01`, "Gestor", "otros deducibles", { frequency: "mensual" });
    expect(find(db, 2026, "missing_recurring")!.message).toContain("Gestor"); // octubre aún no pagado
  });

  it("anual del año anterior aún no vencido este año", () => {
    const db = createTestDb();
    seedScenario(db);
    exp(db, "2025-11-01", "Seguro impago", "seguros", { frequency: "anual" });
    expect(codes(db, 2026, "2026-10-10")).not.toContain("missing_recurring");
    expect(codes(db, 2026, "2026-11-15")).toContain("missing_recurring");
  });

  it("ejercicio futuro: nada que exigir", () => {
    const db = createTestDb();
    seedScenario(db);
    exp(db, "2026-03-01", "Seguro", "seguros", { frequency: "anual" });
    expect(codes(db, 2026, "2025-01-01")).not.toContain("missing_recurring");
  });
});

describe("arrastre que caduca", () => {
  function carry() {
    const db = createTestDb();
    seedCategories(db);
    saveProperty(db, { alias: "V", acquisitionDate: "2019-01-01" });
    for (let y = 2019; y <= 2024; y++) upsertYearParams(db, { year: y, cadastralLandCents: 1, cadastralBuildingCents: 1 });
    exp(db, "2019-06-01", "Reforma", "reparacion y conservacion");
    return db;
  }
  it("avisa en el último año aplicable", () => {
    const db = carry();
    expect(codes(db, 2022)).not.toContain("carryforward_expiring");
    expect(find(db, 2023, "carryforward_expiring")).toMatchObject({ severity: "warning" });
  });
  it("avisa de lo ya caducado", () => {
    const db = carry();
    expect(find(db, 2024, "carryforward_expired")!.message).toMatch(/2019.*100,00/);
    expect(codes(db, 2024)).not.toContain("carryforward_expiring");
  });
});

describe("plazos", () => {
  it("vencido con recargo", () => {
    const db = createTestDb();
    seedScenario(db);
    const a = find(db, 2025, "deadline_overdue")!;
    expect(a.severity).toBe("error");
    expect(a.message).toMatch(/recargo/);
    expect(a.message).toContain("210 tipo 01");
  });
  it("vencido con intereses de demora", () => {
    const db = createTestDb();
    seedScenario(db);
    expect(find(db, 2024, "deadline_overdue")!.message).toMatch(/intereses de demora/);
  });
  it("próximo plazo (< 60 días)", () => {
    const db = createTestDb();
    seedScenario(db);
    const a = find(db, 2024, "deadline_soon", "2025-11-15")!;
    expect(a.message).toContain("46 días");
    expect(a.message).toContain("tipo 02");
    expect(codes(db, 2024, "2025-06-01")).not.toContain("deadline_soon");
  });
  it("presentado → sin alerta de plazo", () => {
    const db = createTestDb();
    seedScenario(db, { withFiling: true });
    createFiling(db, { year: 2024, incomeType: "02", filedAt: "2025-12-01" });
    expect(codes(db, 2024)).not.toContain("deadline_overdue");
  });
});

describe("recurrentes agrupados por beneficiario", () => {
  it("conceptos distintos del mismo beneficiario y categoría cuentan como una serie", () => {
    const db = createTestDb();
    seedScenario(db);
    for (const [m, c] of [["01", "PAGO 1ER TRIMESTRE"], ["04", "PAGO 2DO TRIMESTRE"], ["07", "PAGO 3ER TRIMESTRE"], ["10", "PAGO 4TO TRIMESTRE"]] as const) {
      exp(db, `2025-${m}-10`, c, "comunidad", { frequency: "trimestral", payee: "Comunidad" });
    }
    expect(codes(db, 2025)).not.toContain("missing_recurring");
    db.delete(transactions).where(eq(transactions.concept, "PAGO 3ER TRIMESTRE")).run();
    const a = find(db, 2025, "missing_recurring")!;
    expect(a.count).toBe(1);
    expect(a.message).toContain("Comunidad");
  });
});

describe("series recurrentes que empiezan a mitad de año", () => {
  it("una cuota mensual que empieza en febrero no exige enero", () => {
    const db = createTestDb();
    seedScenario(db);
    for (let m = 2; m <= 10; m++) exp(db, `2026-${String(m).padStart(2, "0")}-01`, "Comisión gestión", "gestion y administracion", { frequency: "mensual", payee: "Gestor" });
    expect(codes(db, 2026, "2026-10-10")).not.toContain("missing_recurring");
  });
  it("pero sí avisa si se salta un mes después de empezar", () => {
    const db = createTestDb();
    seedScenario(db);
    for (const m of [2, 3, 5, 6, 7, 8, 9, 10]) exp(db, `2026-${String(m).padStart(2, "0")}-01`, "Comisión gestión", "gestion y administracion", { frequency: "mensual", payee: "Gestor" });
    expect(find(db, 2026, "missing_recurring", "2026-10-10")!.message).toContain("Gestor (1)");
  });
  it("trimestral que empieza en el T2 de un año ya cerrado espera 3, no 4", () => {
    const db = createTestDb();
    seedScenario(db);
    for (const m of ["07", "10"]) exp(db, `2025-${m}-05`, "Cuota", "comunidad", { frequency: "trimestral", payee: "Admin" });
    exp(db, "2025-04-05", "Cuota", "comunidad", { frequency: "trimestral", payee: "Admin" });
    expect(codes(db, 2025)).not.toContain("missing_recurring");
  });
});
