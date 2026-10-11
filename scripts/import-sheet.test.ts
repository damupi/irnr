import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories, propertyYearParams, transactions } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { listTransactions } from "@/server/transactions";
import cuadro from "./fixtures/cuadro.json";
import gastos from "./fixtures/gastos.json";
import ibi from "./fixtures/ibi.json";
import { FILING_PDF, importFromSheetData } from "./import-sheet";
import { seed } from "./seed";

const TODAY = "2026-10-10";
const data = { gastos: gastos.values, cuadro: cuadro.values, ibi: ibi.values };

function run() {
  const db = createTestDb();
  seed(db);
  const summary = importFromSheetData(db, data, TODAY);
  return { db, summary };
}
const rows = (db: ReturnType<typeof createTestDb>, f = {}) => listTransactions(db, f).rows;
const cat = (r: { category: { cat1: string; cat2: string } | null }) => (r.category ? `${r.category.cat1} / ${r.category.cat2}` : null);
const sumCents = (db: ReturnType<typeof createTestDb>, year: number, cat2: string) =>
  rows(db, { year }).filter((r) => r.category?.cat2 === cat2).reduce((a, r) => a + r.amountCents, 0);

describe("importación de la hoja de gastos", () => {
  it("importa las 46 filas y deja 6 sin categoría", () => {
    const { db, summary } = run();
    expect(summary.gastos).toBe(46);
    expect(summary.uncategorized).toBe(6);
    const pending = rows(db).filter((r) => r.source === "import" && !r.category);
    expect(pending.map((r) => r.amountCents).sort((a, b) => a - b)).toEqual([4000, 5000, 7000, 40000, 68700, 83000]);
  });

  it.each([
    ["Compra vivienda", "adquisicion / precio de compra"],
    ["ITP", "adquisicion / ITP"],
    ["Gastos Notaria", "adquisicion / notaria"],
    ["Gastos Registro", "adquisicion / registro"],
    ["Gastos Gestoria", "adquisicion / gestoria"],
    ["Gastos Mensajeria", "adquisicion / gestoria"],
    ["Intermediacion", "adquisicion / intermediacion inmobiliaria"],
    ["Contrato Gestion Arrendamiento", "gastos / formalizacion contrato"],
    ["IBI", "gastos / impuestos"],
    ["Agua", "suministros / agua"],
    ["Placa Vitroceramica", "amortizaciones / muebles y electrodomesticos"],
    ["Reformas", "gastos / reparacion y conservacion"],
    ["licencia obras menores", "gastos / reparacion y conservacion"],
    ["TRABAJOS EN VOLADIZO FACHADA TRASERA DEL EDIFICIO", "gastos / reparacion y conservacion"],
    ["seguro vivienda", "gastos / seguros"],
    ["seguro de impago", "gastos / seguros"],
    ["4 trimestre", "gastos / comunidad"],
    ["PAGO 2DO TRIMESTRE", "gastos / comunidad"],
  ])("mapea %s → %s", (concept, expected) => {
    const { db } = run();
    const found = rows(db).filter((r) => r.concept === concept && r.source === "import");
    expect(found.length).toBeGreaterThan(0);
    for (const r of found) expect(cat(r)).toBe(expected);
  });

  it("Taxes=Si → factura; Frecuencia vacía → única; importes half-up", () => {
    const { db } = run();
    const itp = rows(db).find((r) => r.concept === "ITP")!;
    expect(itp.hasInvoice).toBe(true);
    expect(itp.frequency).toBe("unica");
    expect(itp.amountCents).toBe(1_900_000);
    expect(itp.date).toBe("2023-10-02");
    expect(rows(db).find((r) => r.concept === "Gastos Notaria")!.hasInvoice).toBe(false);
    const insurance = rows(db).filter((r) => r.concept === "seguro vivienda");
    expect(insurance.every((r) => r.frequency === "anual")).toBe(true);
    expect(rows(db).find((r) => r.concept === "PAGO 2DO TRIMESTRE")!.frequency).toBe("trimestral");
    expect(rows(db).filter((r) => r.concept === "seguro vivienda" && r.date === "2025-01-04")[0].amountCents).toBe(5214);
  });

  it("la base de amortización suma 216.042,90 €", () => {
    const { db } = run();
    const total = rows(db).filter((r) => r.category?.treatment === "acquisition_cost").reduce((a, r) => a + r.amountCents, 0);
    expect(total).toBe(21_604_290);
  });

  it("los muebles suman 1.077,26 €", () => {
    const { db } = run();
    expect(rows(db).filter((r) => r.category?.treatment === "furniture_10").reduce((a, r) => a + r.amountCents, 0)).toBe(107_726);
  });
});

describe("intereses y capital de la hipoteca", () => {
  it("un gasto de intereses por cuota vencida (36 a 2026-10-10)", () => {
    const { db, summary } = run();
    expect(summary.interests).toBe(36);
    const interest = rows(db).filter((r) => r.category?.cat2 === "intereses hipoteca");
    expect(interest).toHaveLength(36);
    expect(interest.every((r) => r.frequency === "mensual" && r.date <= TODAY)).toBe(true);
  });
  it("Σ 2024 = 3.923,73 € y Σ 2025 = 3.230,83 €", () => {
    const { db } = run();
    expect(sumCents(db, 2024, "intereses hipoteca")).toBe(392_373);
    expect(sumCents(db, 2025, "intereses hipoteca")).toBe(323_083);
  });
  it("amortizaciones anticipadas → no deducible", () => {
    const { db, summary } = run();
    expect(summary.earlyRepayments).toBe(4);
    const capital = rows(db).filter((r) => r.category?.cat2 === "amortizacion capital prestamo");
    expect(capital.map((r) => [r.date, r.amountCents]).sort()).toEqual([
      ["2024-05-02", 1_000_000],
      ["2025-04-02", 1_000_000],
      ["2025-06-02", 1_000_000],
      ["2026-01-02", 1_900_000],
    ]);
    expect(capital.every((r) => r.category?.treatment === "non_deductible")).toBe(true);
  });
  it("no importa cuotas futuras", () => {
    const { db } = run();
    expect(rows(db).filter((r) => r.category?.cat2 === "intereses hipoteca").every((r) => r.date <= TODAY)).toBe(true);
    const early = importFromSheetData(createDb(), data, "2024-01-01");
    expect(early.interests).toBe(2);
    expect(early.earlyRepayments).toBe(0);
  });
});

function createDb() {
  const db = createTestDb();
  seed(db);
  return db;
}

describe("IBI, rentas y fianzas", () => {
  it("parámetros catastrales 2023–2026", () => {
    const { db } = run();
    const params = db.select().from(propertyYearParams).all();
    expect(params).toHaveLength(4);
    for (const p of params) expect([p.cadastralLandCents, p.cadastralBuildingCents]).toEqual([863_269, 1_688_699]);
    expect(params.find((p) => p.year === 2023)!.daysImputedOverride).toBe(90);
  });
  it("recibos IBI 2025 y 2026 de 144,66 € el 30/04", () => {
    const { db } = run();
    for (const year of [2025, 2026]) {
      const r = rows(db, { year }).filter((x) => x.concept === `IBI ${year}`);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ date: `${year}-04-30`, amountCents: 14_466, hasInvoice: true });
      expect(cat(r[0])).toBe("gastos / impuestos");
    }
  });
  it("rentas desde los contratos", () => {
    const { db } = run();
    const rent = (year: number) => rows(db, { year }).filter((r) => r.category?.cat2 === "alquiler");
    expect(rent(2024)).toHaveLength(11);
    expect(rent(2024).reduce((a, r) => a + r.amountCents, 0)).toBe(11 * 78_000);
    expect(rent(2025).reduce((a, r) => a + r.amountCents, 0)).toBe(12 * 78_000);
    expect(rent(2026).reduce((a, r) => a + r.amountCents, 0)).toBe(78_000 + 9 * 96_000);
  });
  it("fianzas recibidas no computan", () => {
    const { db } = run();
    const f = rows(db).filter((r) => r.category?.cat2 === "fianza");
    expect(f.map((r) => [r.date, r.amountCents]).sort()).toEqual([["2024-02-01", 78_000], ["2026-02-01", 96_000]]);
    expect(f.every((r) => r.category?.treatment === "non_taxable_income" && r.kind === "income")).toBe(true);
  });
});

describe("idempotencia", () => {
  it("ejecutar dos veces no duplica nada", () => {
    const { db } = run();
    const before = db.select().from(transactions).all().length;
    const again = importFromSheetData(db, data, TODAY);
    expect(db.select().from(transactions).all().length).toBe(before);
    expect(again.created).toBe(0);
    expect(db.select().from(categories).all().length).toBeGreaterThan(30);
  });
  it("cada movimiento importado tiene external_key única", () => {
    const { db } = run();
    const keys = db.select({ k: transactions.externalKey }).from(transactions).where(and(eq(transactions.source, "import"))).all().map((r) => r.k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k)).toBe(true);
  });
});

describe("nombres de los 210 en Drive", () => {
  it("extrae el ejercicio del nombre del PDF", () => {
    expect(FILING_PDF.exec("210_IMPUESTO_RENTA_NO_RESIDENTES_2023.pdf")?.[1]).toBe("2023");
    expect(FILING_PDF.exec("210_2024.pdf")?.[1]).toBe("2024");
    expect(FILING_PDF.test("JustificanteRenta2023.pdf")).toBe(false);
    expect(FILING_PDF.test("pago hacienda 2024.pdf")).toBe(false);
  });
});
