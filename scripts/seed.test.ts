import { describe, expect, it } from "vitest";
import { categories, filings, propertyYearParams, rentalPeriods, transactions } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { getProperty } from "@/server/properties";
import { getTaxYear } from "@/server/taxYear";
import { seed } from "./seed";

const counts = (db: ReturnType<typeof createTestDb>) => ({
  categories: db.select().from(categories).all().length,
  params: db.select().from(propertyYearParams).all().length,
  rentals: db.select().from(rentalPeriods).all().length,
  filings: db.select().from(filings).all().length,
  transactions: db.select().from(transactions).all().length,
});

describe("seed", () => {
  it("crea inmueble, parámetros 2023–2026, contratos y declaraciones", () => {
    const db = createTestDb();
    seed(db);
    expect(getProperty(db)).toMatchObject({ alias: "Piso", cadastralRef: "0000000XX0000X0000XX", acquisitionDate: "2023-10-02", ownershipPct: 100, residenceCountry: "DE", taxRatePct: 19 });
    const c = counts(db);
    expect(c).toMatchObject({ params: 4, rentals: 2, filings: 2, transactions: 0 });
    expect(c.categories).toBeGreaterThan(30);
    const rentals = db.select().from(rentalPeriods).all();
    expect(rentals.map((r) => [r.startDate, r.endDate, r.monthlyRentCents])).toEqual([
      ["2024-02-01", "2026-01-31", 78_000],
      ["2026-02-01", "2027-01-31", 96_000],
    ]);
    const f = db.select().from(filings).all();
    expect(f.find((x) => x.year === 2024)).toMatchObject({ incomeType: "01", filedAt: "2025-10-12", grossCents: 936_000, expensesCents: 894_000, baseCents: 42_000, taxCents: 7_980 });
    expect(f.find((x) => x.year === 2023)).toMatchObject({ incomeType: "02", baseCents: 12_585, taxCents: 2_391 });
  });

  it("2023 reproduce la imputada presentada (override 90 días)", () => {
    const db = createTestDb();
    seed(db);
    expect(getTaxYear(db, 2023, "2026-10-10").result.imputada).toMatchObject({ baseCents: 12_585, taxCents: 2_391 });
  });

  it("es idempotente", () => {
    const db = createTestDb();
    seed(db);
    const first = counts(db);
    seed(db);
    expect(counts(db)).toEqual(first);
  });

  it("--demo añade movimientos ficticios, también idempotente", () => {
    const db = createTestDb();
    seed(db, { demo: true, today: "2026-10-10" });
    const n = counts(db).transactions;
    expect(n).toBeGreaterThan(40);
    seed(db, { demo: true, today: "2026-10-10" });
    expect(counts(db).transactions).toBe(n);
    const view = getTaxYear(db, 2025, "2026-10-10");
    expect(view.result.rendimientos!.grossCents).toBe(936_000);
    expect(db.select().from(transactions).all().some((t) => t.categoryId === null)).toBe(true);
  });
});
