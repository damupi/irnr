import { describe, expect, it } from "vitest";
import { treatmentBadge } from "./treatment";

const c = (over = {}) => ({ cat1: "gastos", cat2: "seguros", treatment: "deductible" as const, box: 10, ...over });

describe("treatmentBadge", () => {
  it("deducible con casilla", () => {
    expect(treatmentBadge(c())).toEqual({ label: "Casilla 10 · Seguros", tone: "deductible" });
    expect(treatmentBadge(c({ cat2: "comunidad", box: 5 })).label).toBe("Casilla 5 · Comunidad");
  });
  it("suministros usan la casilla 9", () => {
    expect(treatmentBadge(c({ cat1: "suministros", cat2: "agua", box: 9 })).label).toBe("Casilla 9 · Agua");
  });
  it("resto de tratamientos", () => {
    expect(treatmentBadge(c({ treatment: "capped_1_4", box: null }))).toEqual({ label: "Límite 1–4", tone: "capped" });
    expect(treatmentBadge(c({ treatment: "furniture_10" }))).toEqual({ label: "Amortizable 10 %", tone: "asset" });
    expect(treatmentBadge(c({ treatment: "improvement_3" }))).toEqual({ label: "Amortizable 3 %", tone: "asset" });
    expect(treatmentBadge(c({ treatment: "acquisition_cost" }))).toEqual({ label: "Coste adquisición", tone: "asset" });
    expect(treatmentBadge(c({ treatment: "non_deductible" }))).toEqual({ label: "No deducible", tone: "neutral" });
    expect(treatmentBadge(c({ treatment: "income" }))).toEqual({ label: "Ingreso", tone: "income" });
    expect(treatmentBadge(c({ treatment: "non_taxable_income" }))).toEqual({ label: "No computa", tone: "neutral" });
  });
  it("deducible sin casilla y sin categoría", () => {
    expect(treatmentBadge(c({ box: null })).label).toBe("Deducible · Seguros");
    expect(treatmentBadge(null)).toEqual({ label: "Pendiente", tone: "pending" });
  });
});
