import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { seedCategories } from "./categories";
import { saveProperty } from "./properties";
import { createRentalPeriod, deleteRentalPeriod, generateIncomeFromRental, listRentalPeriods, updateRentalPeriod } from "./rentals";
import { listTransactions } from "./transactions";

function setup() {
  const db = createTestDb();
  seedCategories(db);
  saveProperty(db, { alias: "V", acquisitionDate: "2023-10-02" });
  return db;
}
const c1 = { tenant: "Inquilino 1", startDate: "2024-02-01", endDate: "2026-01-31", monthlyRentCents: 78_000 };
const c2 = { tenant: "Inquilino 2", startDate: "2026-02-01", endDate: "2027-01-31", monthlyRentCents: 96_000 };

describe("rental CRUD", () => {
  it("crea, lista, actualiza y borra", () => {
    const db = setup();
    const r = createRentalPeriod(db, c1);
    createRentalPeriod(db, c2);
    expect(listRentalPeriods(db).map((x) => x.startDate)).toEqual(["2024-02-01", "2026-02-01"]);
    expect(updateRentalPeriod(db, r.id, { monthlyRentCents: 80_000 }).monthlyRentCents).toBe(80_000);
    expect(() => updateRentalPeriod(db, 99, { monthlyRentCents: 1 })).toThrow(/no existe/);
    deleteRentalPeriod(db, r.id);
    expect(listRentalPeriods(db)).toHaveLength(1);
  });
  it("valida", () => {
    const db = setup();
    expect(() => createRentalPeriod(db, { ...c1, monthlyRentCents: 0 })).toThrow();
    expect(() => createRentalPeriod(db, { ...c1, startDate: "x" })).toThrow();
    expect(() => createRentalPeriod(db, { ...c1, endDate: "2024-01-01" })).toThrow(/anterior/);
  });
  it("sin inmueble → error", () => {
    expect(() => createRentalPeriod(createTestDb(), c1)).toThrow(/inmueble/);
  });
});

describe("generateIncomeFromRental", () => {
  it("contrato 1 hasta 2026-10-10 → 24 filas", () => {
    const db = setup();
    const r = createRentalPeriod(db, c1);
    expect(generateIncomeFromRental(db, r.id, { until: "2026-10-10" })).toBe(24);
    const rows = listTransactions(db, { sort: "date", dir: "asc" }).rows;
    expect(rows).toHaveLength(24);
    expect(rows[0]).toMatchObject({ date: "2024-02-01", amountCents: 78_000, kind: "income", source: "contract", payee: "Inquilino 1" });
    expect(rows[0].category).toMatchObject({ cat1: "ingresos", cat2: "alquiler" });
    expect(rows[0].externalKey).toBe(`rental:${r.id}:2024-02`);
    expect(rows[23].date).toBe("2026-01-01");
  });
  it("contrato 2 → 9 filas (feb–oct 2026)", () => {
    const db = setup();
    const r = createRentalPeriod(db, c2);
    expect(generateIncomeFromRental(db, r.id, { until: "2026-10-10" })).toBe(9);
  });
  it("re-ejecutar no duplica; ampliar until añade solo lo nuevo", () => {
    const db = setup();
    const r = createRentalPeriod(db, c2);
    generateIncomeFromRental(db, r.id, { until: "2026-10-10" });
    expect(generateIncomeFromRental(db, r.id, { until: "2026-10-10" })).toBe(0);
    expect(generateIncomeFromRental(db, r.id, { until: "2026-12-01" })).toBe(2);
    expect(listTransactions(db, {}).rows).toHaveLength(11);
  });
  it("empieza a mitad de mes: renta completa fechada el día 1", () => {
    const db = setup();
    const r = createRentalPeriod(db, { ...c1, startDate: "2024-02-15", endDate: "2024-04-10" });
    expect(generateIncomeFromRental(db, r.id, { until: "2030-01-01" })).toBe(3);
    expect(listTransactions(db, { sort: "date", dir: "asc" }).rows.map((x) => x.date)).toEqual(["2024-02-01", "2024-03-01", "2024-04-01"]);
  });
  it("contrato vigente (sin fin) llega hasta until", () => {
    const db = setup();
    const r = createRentalPeriod(db, { ...c2, endDate: null });
    expect(generateIncomeFromRental(db, r.id, { until: "2026-04-30" })).toBe(3);
  });
  it("until anterior al inicio → 0", () => {
    const db = setup();
    const r = createRentalPeriod(db, c2);
    expect(generateIncomeFromRental(db, r.id, { until: "2026-01-01" })).toBe(0);
  });
  it("errores: contrato inexistente y falta categoría", () => {
    const db = setup();
    expect(() => generateIncomeFromRental(db, 99, { until: "2026-01-01" })).toThrow(/no existe/);
    const bare = createTestDb();
    saveProperty(bare, { alias: "V", acquisitionDate: "2023-10-02" });
    const r = createRentalPeriod(bare, c1);
    expect(() => generateIncomeFromRental(bare, r.id, { until: "2026-01-01" })).toThrow(/categoría/);
  });
});
