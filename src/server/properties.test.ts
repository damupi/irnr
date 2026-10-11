import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { getProperty, getYearParams, listYearParams, saveProperty, upsertYearParams } from "./properties";

const prop = { alias: "Piso", acquisitionDate: "2023-10-02", cadastralRef: "REF123" };
const yp = (year: number, over = {}) => ({ year, cadastralLandCents: 863_269, cadastralBuildingCents: 1_688_699, ...over });

describe("properties", () => {
  it("saveProperty crea y luego actualiza el único inmueble", () => {
    const db = createTestDb();
    expect(getProperty(db)).toBeNull();
    const p = saveProperty(db, prop);
    expect(p).toMatchObject({ ownershipPct: 100, residenceCountry: "DE", taxRatePct: 19 });
    const u = saveProperty(db, { ...prop, alias: "Piso", ownershipPct: 50 });
    expect(u.id).toBe(p.id);
    expect(u).toMatchObject({ alias: "Piso", ownershipPct: 50 });
  });
  it("valida", () => {
    const db = createTestDb();
    expect(() => saveProperty(db, { ...prop, acquisitionDate: "x" })).toThrow();
    expect(() => saveProperty(db, { ...prop, ownershipPct: 0 })).toThrow();
    expect(() => saveProperty(db, { ...prop, alias: "" })).toThrow();
  });
});

describe("year params", () => {
  it("upsertYearParams necesita inmueble", () => {
    expect(() => upsertYearParams(createTestDb(), yp(2024))).toThrow(/inmueble/);
  });
  it("upsert crea y actualiza por año", () => {
    const db = createTestDb();
    saveProperty(db, prop);
    upsertYearParams(db, yp(2024));
    upsertYearParams(db, yp(2024, { imputationRatePct: 1.1, daysImputedOverride: 90, deadlineOverrideFrom: "2026-01-01", deadlineOverrideTo: "2026-12-31" }));
    expect(listYearParams(db)).toHaveLength(1);
    expect(getYearParams(db, 2024)).toEqual({
      year: 2024, cadastralLandCents: 863_269, cadastralBuildingCents: 1_688_699, imputationRatePct: 1.1,
      initialCarryforwardCents: 0, daysImputedOverride: 90, deadlineOverride: { from: "2026-01-01", to: "2026-12-31" },
    });
  });
  it("hereda el último año anterior (sin overrides ni arrastre inicial)", () => {
    const db = createTestDb();
    saveProperty(db, prop);
    upsertYearParams(db, yp(2023, { daysImputedOverride: 90, initialCarryforwardCents: 500 }));
    upsertYearParams(db, yp(2024, { cadastralLandCents: 900_000 }));
    expect(getYearParams(db, 2026)).toEqual({
      year: 2026, cadastralLandCents: 900_000, cadastralBuildingCents: 1_688_699, imputationRatePct: 2,
      initialCarryforwardCents: 0, daysImputedOverride: null, deadlineOverride: null,
    });
    expect(getYearParams(db, 2023)!.daysImputedOverride).toBe(90);
  });
  it("sin año anterior → null", () => {
    const db = createTestDb();
    saveProperty(db, prop);
    upsertYearParams(db, yp(2024));
    expect(getYearParams(db, 2023)).toBeNull();
  });
  it("valida importes", () => {
    const db = createTestDb();
    saveProperty(db, prop);
    expect(() => upsertYearParams(db, yp(2024, { cadastralLandCents: -1 }))).toThrow();
  });
});
