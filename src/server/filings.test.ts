import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { createFiling, deleteFiling, getFiling, listFilings, updateFiling } from "./filings";

const f24 = { year: 2024, incomeType: "01" as const, filedAt: "2025-10-12", grossCents: 936_000, expensesCents: 894_000, baseCents: 42_000, taxCents: 7_980 };

describe("filings", () => {
  it("CRUD y getFiling", () => {
    const db = createTestDb();
    const f = createFiling(db, f24);
    createFiling(db, { year: 2023, incomeType: "02", filedAt: "2024-12-31", baseCents: 12_585, taxCents: 2_391 });
    expect(listFilings(db).map((x) => x.year)).toEqual([2023, 2024]);
    expect(getFiling(db, 2024, "01")).toEqual({ year: 2024, incomeType: "01", filedAt: "2025-10-12", grossCents: 936_000, expensesCents: 894_000, baseCents: 42_000, taxCents: 7_980 });
    expect(getFiling(db, 2024, "02")).toBeNull();
    expect(updateFiling(db, f.id, { taxCents: 1 }).taxCents).toBe(1);
    expect(() => updateFiling(db, 99, { taxCents: 1 })).toThrow(/no existe/);
    deleteFiling(db, f.id);
    expect(getFiling(db, 2024, "01")).toBeNull();
  });
  it("valida", () => {
    const db = createTestDb();
    expect(() => createFiling(db, { ...f24, incomeType: "03" as never })).toThrow();
    expect(() => createFiling(db, { ...f24, filedAt: "12/10/2025" })).toThrow();
    expect(() => createFiling(db, { ...f24, year: 1999 })).toThrow();
  });
});
