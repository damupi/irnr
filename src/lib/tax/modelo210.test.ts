import { describe, expect, it } from "vitest";
import * as fx from "./__fixtures__/y2024";
import { computeTaxYear, type ComputeInput } from "./modelo210";

const base = (over: Partial<ComputeInput> = {}): ComputeInput => ({
  property: fx.property,
  params: fx.params(2024),
  periods: fx.periods,
  transactions: fx.transactions2024,
  pendingCarryforward: [{ originYear: 2023, cents: 154_458 }],
  priorAssetDeductions: {},
  year: 2024,
  today: "2026-10-10",
  ...over,
});

describe("ejercicio 2024", () => {
  const r = computeTaxYear(base());
  const rend = r.rendimientos!;

  it("días", () => {
    expect(r.days).toEqual({ inYear: 366, owned: 366, rented: 335, imputed: 31 });
    expect(r.rentRatio).toBeCloseTo(335 / 366, 10);
  });
  it("íntegros y casillas de referencia", () => {
    expect(rend.grossCents).toBe(858_000);
    expect(rend.boxes[13]).toBe(9860);
    expect(rend.boxes[14]).toBe(392_556);
    expect(rend.boxes[6]).toBe(78_000);
    expect(rend.boxes[11]).toBe(13_241);
  });
  it("casillas prorrateadas", () => {
    expect(rend.boxes[5]).toBe(Math.round((12_000 * 335) / 366));
    expect(rend.boxes[10]).toBe(Math.round((23_501 * 335) / 366));
    expect(rend.boxes[7]).toBe(0);
    expect(rend.boxes[15]).toBe(0);
  });
  it("límite 1-4: intereses prorrateados + reparaciones sin prorrateo", () => {
    expect(rend.boxes[3]).toBe(Math.round((392_373 * 335) / 366 + 40_000));
    expect(rend.boxes[1]).toBe(154_458);
    expect(rend.boxes[2]).toBe(154_458);
    expect(rend.boxes[4]).toBe(rend.boxes[3]);
    expect(r.carryforward).toMatchObject({ generated: 0, applied: 154_458 + rend.boxes[3], pending: [], expired: [] });
  });
  it("total, base y cuota", () => {
    const sum = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].reduce((a, b) => a + rend.boxes[b as 2], 0);
    expect(rend.boxes[17]).toBe(sum);
    expect(rend.baseCents).toBe(Math.max(0, 858_000 - sum));
    expect(rend.taxCents).toBe(Math.round(rend.baseCents * 0.19));
  });
  it("detalle por casilla", () => {
    expect(rend.detail[11]).toEqual([{ txId: 52, rawCents: 14_466, computedCents: 13_241 }]);
    expect(rend.detail[3].map((d) => d.txId)).toContain(40);
    expect(rend.detail[13]).toHaveLength(5);
  });
  it("amortización", () => {
    expect(r.amortization.building.amortizationCents).toBe(392_556);
    expect(r.amortization.furniture).toHaveLength(5);
    expect(r.amortization.improvements).toEqual([]);
  });
  it("renta imputada de enero", () => {
    expect(r.imputada).toEqual({ cadastralTotalCents: 2_551_968, ratePct: 2, days: 31, baseCents: 4323, taxCents: 821 });
  });
  it("plazos y avisos", () => {
    expect(r.deadlines.rendimientos).toEqual({ from: "2025-01-01", to: "2025-01-20" });
    expect(r.deadlines.imputada).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(r.warnings).toEqual([]);
  });
  it("cuota cero usa el plazo de cuota cero (2026)", () => {
    const z = computeTaxYear(
      base({ year: 2026, params: fx.params(2026), transactions: [], pendingCarryforward: [], periods: fx.periods }),
    );
    expect(z.rendimientos!.taxCents).toBe(0);
    expect(z.deadlines.rendimientos).toEqual({ from: "2027-01-01", to: "2027-01-20" });
    expect(z.imputada).toBeNull();
    expect(z.deadlines.imputada).toBeNull();
  });
});

describe("ejercicio 2025", () => {
  const r = computeTaxYear(
    base({
      year: 2025,
      params: fx.params(2025),
      transactions: [...fx.income2025, ...fx.interest2025, ...fx.furniture, ...fx.acquisitionCosts],
      pendingCarryforward: [],
    }),
  );
  it("año completo", () => {
    expect(r.rentRatio).toBe(1);
    expect(r.imputada).toBeNull();
    expect(r.rendimientos!.grossCents).toBe(936_000);
    expect(r.rendimientos!.boxes[14]).toBe(428_882);
    expect(r.rendimientos!.boxes[3]).toBe(323_083);
    expect(r.rendimientos!.boxes[13]).toBe(10_773);
  });
  it("tope acumulado de muebles con deducciones previas", () => {
    const prior = Object.fromEntries(fx.furniture.map((f) => [f.id, f.amountCents - 100]));
    const c = computeTaxYear(
      base({ year: 2025, params: fx.params(2025), transactions: [...fx.income2025, ...fx.furniture], pendingCarryforward: [], priorAssetDeductions: prior }),
    );
    expect(c.rendimientos!.boxes[13]).toBe(500);
  });
});

describe("ejercicio 2023 (sin alquiler)", () => {
  const r = computeTaxYear(
    base({
      year: 2023,
      params: fx.params(2023, { daysImputedOverride: 90 }),
      transactions: [...fx.repairs2023, ...fx.acquisitionCosts, ...fx.interest2024.slice(0, 1)],
      pendingCarryforward: [],
    }),
  );
  it("sin rendimientos; imputada con override", () => {
    expect(r.days).toEqual({ inYear: 365, owned: 91, rented: 0, imputed: 90 });
    expect(r.rendimientos).toBeNull();
    expect(r.imputada).toMatchObject({ days: 90, baseCents: 12_585, taxCents: 2391 });
    expect(r.deadlines.rendimientos).toBeNull();
    expect(r.deadlines.imputada).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });
  it("las reparaciones generan pendiente", () => {
    expect(r.carryforward.generated).toBe(154_458);
    expect(r.carryforward.pending).toEqual([{ originYear: 2023, cents: 154_458 }]);
  });
});

describe("casos límite", () => {
  it("movimientos sin categoría se ignoran con aviso", () => {
    const r = computeTaxYear(
      base({ transactions: [...fx.income2024, fx.tx(900, "2024-06-01", 99_999, null), fx.tx(901, "2024-07-01", 1, null)], pendingCarryforward: [] }),
    );
    expect(r.warnings).toEqual(["2 movimientos sin categoría"]);
    expect(r.rendimientos!.grossCents).toBe(858_000);
    expect(r.rendimientos!.boxes[16]).toBe(0);
    expect(r.rendimientos!.boxes[6]).toBe(0);
  });
  it("aviso en singular", () => {
    const r = computeTaxYear(base({ transactions: [fx.tx(900, "2024-06-01", 5, null)], pendingCarryforward: [] }));
    expect(r.warnings).toEqual(["1 movimiento sin categoría"]);
  });
  it("sin categoría de otros ejercicios no avisa", () => {
    const r = computeTaxYear(base({ transactions: [fx.tx(900, "2022-06-01", 5, null)], pendingCarryforward: [] }));
    expect(r.warnings).toEqual([]);
  });
  it("titularidad 50 % → todo a la mitad", () => {
    const full = computeTaxYear(base());
    const half = computeTaxYear(base({ property: { ...fx.property, ownershipPct: 50 } }));
    expect(half.rendimientos!.grossCents).toBe(429_000);
    expect(half.rendimientos!.boxes[6]).toBe(39_000);
    expect(half.rendimientos!.boxes[14]).toBe(Math.round(392_556 / 2));
    expect(half.imputada!.baseCents).toBe(Math.round(full.imputada!.baseCents / 2));
  });
  it("taxYearOverride mueve el movimiento de ejercicio", () => {
    const moved = fx.tx(950, "2025-01-15", 50_000, "deductible", { box: 6, taxYearOverride: 2024 });
    const out = fx.tx(951, "2024-01-15", 70_000, "deductible", { box: 6, taxYearOverride: 2025 });
    const r = computeTaxYear(base({ transactions: [...fx.income2024, moved, out], pendingCarryforward: [] }));
    expect(r.rendimientos!.boxes[6]).toBe(50_000);
  });
  it("allocationPct reduce el gasto", () => {
    const r = computeTaxYear(base({ transactions: [...fx.income2024, fx.tx(960, "2024-03-01", 10_000, "deductible", { box: 6, allocationPct: 50 })], pendingCarryforward: [] }));
    expect(r.rendimientos!.boxes[6]).toBe(5000);
  });
  it("base negativa → 0", () => {
    const r = computeTaxYear(
      base({ transactions: [fx.tx(1, "2024-03-01", 10_000, "income"), fx.tx(2, "2024-03-02", 50_000, "deductible", { box: 16 })], pendingCarryforward: [] }),
    );
    // 50.000 de otros gastos + amortización del inmueble sobre el valor catastral (sin costes registrados)
    expect(r.rendimientos!.boxes[17]).toBe(50_000 + r.rendimientos!.boxes[14]);
    expect(r.rendimientos!.baseCents).toBe(0);
    expect(r.rendimientos!.taxCents).toBe(0);
  });
  it("gasto deducible sin casilla → otros gastos (16)", () => {
    const r = computeTaxYear(base({ transactions: [...fx.income2024, fx.tx(980, "2024-03-01", 1_000, "deductible")], pendingCarryforward: [] }));
    expect(r.rendimientos!.boxes[16]).toBe(1_000);
  });
  it("mejoras al 3 %", () => {
    const r = computeTaxYear(
      base({ year: 2025, params: fx.params(2025), transactions: [...fx.income2025, fx.tx(970, "2024-06-01", 365_000, "improvement_3", { box: 15 })], pendingCarryforward: [] }),
    );
    expect(r.rendimientos!.boxes[15]).toBe(10_950);
    expect(r.amortization.improvements).toHaveLength(1);
  });
  it("mejora comprada después del año no cuenta", () => {
    const r = computeTaxYear(base({ transactions: [...fx.income2024, fx.tx(971, "2025-06-01", 365_000, "improvement_3")], pendingCarryforward: [] }));
    expect(r.rendimientos!.boxes[15]).toBe(0);
  });
  it("ejercicio anterior a la compra: sin días, sin nada", () => {
    const r = computeTaxYear(base({ year: 2022, params: fx.params(2022), transactions: [], pendingCarryforward: [] }));
    expect(r.days.owned).toBe(0);
    expect(r.rendimientos).toBeNull();
    expect(r.imputada).toBeNull();
  });
  it("override de plazo del ejercicio", () => {
    const deadlineOverride = { from: "2026-01-01", to: "2026-12-31" };
    const r = computeTaxYear(base({ year: 2025, params: fx.params(2025, { deadlineOverride }), transactions: fx.income2025, pendingCarryforward: [] }));
    expect(r.deadlines.rendimientos).toEqual(deadlineOverride);
  });
  it("ejercicio futuro avisa", () => {
    const r = computeTaxYear(base({ year: 2027, params: fx.params(2027), transactions: [], pendingCarryforward: [], today: "2026-10-10" }));
    expect(r.warnings).toContain("Ejercicio futuro: datos provisionales");
  });
});
