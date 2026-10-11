import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { transactions } from "@/db/schema";
import { SEED_CATEGORIES, deleteCategory, findCategory, listCategories, seedCategories, createCategory, updateCategory } from "./categories";

describe("categories", () => {
  it("seedCategories es idempotente", () => {
    const db = createTestDb();
    seedCategories(db);
    const n = listCategories(db).length;
    expect(n).toBe(SEED_CATEGORIES.length);
    seedCategories(db);
    expect(listCategories(db)).toHaveLength(n);
  });

  it("la semilla sigue PRD §8", () => {
    const db = createTestDb();
    seedCategories(db);
    expect(findCategory(db, "gastos", "comunidad")).toMatchObject({ treatment: "deductible", box: 5, prorate: true });
    expect(findCategory(db, "gastos", "reparacion y conservacion")).toMatchObject({ treatment: "capped_1_4", prorate: false });
    expect(findCategory(db, "gastos", "intereses hipoteca")).toMatchObject({ treatment: "capped_1_4", prorate: true });
    expect(findCategory(db, "ingresos", "fianza")?.treatment).toBe("non_taxable_income");
    expect(findCategory(db, "suministros", "agua")).toMatchObject({ box: 9, prorate: true });
    expect(findCategory(db, "amortizaciones", "muebles y electrodomesticos")?.treatment).toBe("furniture_10");
    expect(findCategory(db, "no deducible", "amortizacion capital prestamo")?.treatment).toBe("non_deductible");
    expect(findCategory(db, "x", "y")).toBeNull();
  });

  it("deleteCategory en uso → error; sin uso → borra", () => {
    const db = createTestDb();
    seedCategories(db);
    const used = findCategory(db, "gastos", "seguros")!;
    db.insert(transactions).values({ date: "2024-01-01", kind: "expense", amountCents: 100, concept: "x", categoryId: used.id }).run();
    expect(() => deleteCategory(db, used.id)).toThrow(/en uso/);
    const free = findCategory(db, "gastos", "comunidad")!;
    deleteCategory(db, free.id);
    expect(findCategory(db, "gastos", "comunidad")).toBeNull();
  });

  it("create y update validan", () => {
    const db = createTestDb();
    const c = createCategory(db, { cat1: "gastos", cat2: "nueva", treatment: "deductible", box: 16, prorate: false, help: null });
    expect(updateCategory(db, c.id, { help: "ayuda" }).help).toBe("ayuda");
    expect(() => createCategory(db, { cat1: "", cat2: "x", treatment: "deductible", box: null, prorate: false, help: null })).toThrow();
    expect(() => updateCategory(db, 9999, { help: "x" })).toThrow(/no existe/);
  });
});
