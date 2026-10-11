import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { TODAY, seedScenario } from "./__fixtures__/scenario";
import { getTaxYear } from "./taxYear";
import { createTestDb as fresh } from "@/db/test-utils";
import { saveProperty, upsertYearParams } from "./properties";

describe("getTaxYear", () => {
  it("el pendiente de 2023 aparece en la casilla 1 de 2024", () => {
    const db = createTestDb();
    seedScenario(db);
    const { result } = getTaxYear(db, 2024, TODAY);
    expect(result.rendimientos!.boxes[1]).toBe(154_458);
    expect(result.rendimientos!.boxes[2]).toBe(154_458);
    expect(result.rendimientos!.grossCents).toBe(858_000);
    expect(result.rendimientos!.boxes[14]).toBe(392_556);
    expect(result.rendimientos!.boxes[13]).toBe(9_860);
    expect(result.rendimientos!.boxes[3]).toBe(Math.round((392_373 * 335) / 366));
    expect(result.carryforward.pending).toEqual([]);
  });

  it("2023: imputada con override y sin rendimientos", () => {
    const db = createTestDb();
    seedScenario(db);
    const { result } = getTaxYear(db, 2023, TODAY);
    expect(result.rendimientos).toBeNull();
    expect(result.imputada).toMatchObject({ baseCents: 12_585, taxCents: 2_391 });
    expect(result.carryforward.pending).toEqual([{ originYear: 2023, cents: 154_458 }]);
  });

  it("2025: año completo; la amortización de muebles encadena años", () => {
    const db = createTestDb();
    seedScenario(db);
    const { result } = getTaxYear(db, 2025, TODAY);
    expect(result.rendimientos!.grossCents).toBe(936_000);
    expect(result.rendimientos!.boxes[13]).toBe(10_773);
    expect(result.rendimientos!.boxes[14]).toBe(428_882);
    expect(result.imputada).toBeNull();
  });

  it("arrastre inicial manual entra en el primer año", () => {
    const db = createTestDb();
    seedScenario(db, { initialCarryforwardCents: 5_000 });
    const { result } = getTaxYear(db, 2024, TODAY);
    expect(result.rendimientos!.boxes[1]).toBe(154_458 + 5_000);
  });

  it("devuelve declaraciones presentadas y estado", () => {
    const db = createTestDb();
    seedScenario(db, { withFiling: true });
    const y24 = getTaxYear(db, 2024, TODAY);
    expect(y24.filings.rendimientos).toMatchObject({ taxCents: 7_980 });
    expect(y24.status.rendimientos?.status).toBe("filed_late");
    // enero de 2024 imputado y sin declaración tipo 02 presentada → vencido
    expect(y24.status.imputada?.status).toBe("overdue");
    const y23 = getTaxYear(db, 2023, TODAY);
    expect(y23.status.imputada?.status).toBe("filed");
    expect(y23.status.rendimientos).toBeNull();
    const y25 = getTaxYear(db, 2025, TODAY);
    expect(y25.status.rendimientos).toMatchObject({ status: "overdue" });
  });

  it("errores: sin inmueble o sin parámetros", () => {
    expect(() => getTaxYear(fresh(), 2024, TODAY)).toThrow(/inmueble/);
    const db = fresh();
    saveProperty(db, { alias: "V", acquisitionDate: "2023-10-02" });
    expect(() => getTaxYear(db, 2024, TODAY)).toThrow(/parámetros/);
    const s = createTestDb();
    seedScenario(s);
    expect(() => getTaxYear(s, 2022, TODAY)).toThrow(/parámetros/);
  });

  it("los años de la cadena sin parámetros se saltan", () => {
    const db = fresh();
    saveProperty(db, { alias: "V", acquisitionDate: "2020-01-01" });
    upsertYearParams(db, { year: 2023, cadastralLandCents: 100_000, cadastralBuildingCents: 200_000 });
    expect(getTaxYear(db, 2023, TODAY).result.year).toBe(2023);
  });
});
