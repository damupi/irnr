import { describe, expect, it } from "vitest";
import { assetAmortization, buildingAmortization } from "./amortization";
import type { RentalPeriod } from "./types";

describe("buildingAmortization", () => {
  const base = { acquisitionCostsCents: [20_000_000, 1_604_290], landCents: 863_269, buildingCents: 1_688_699 };
  it("2024 prorrateado 335/366", () => {
    expect(buildingAmortization({ ...base, rentRatio: 335 / 366 }).amortizationCents).toBe(392_556);
  });
  it("año completo", () => {
    const r = buildingAmortization({ ...base, rentRatio: 1 });
    expect(r.amortizationCents).toBe(428_882);
    expect(r.baseCents).toBe(21_604_290);
    expect(r.acquisitionTotalCents).toBe(21_604_290);
    expect(r.cadastralTotalCents).toBe(2_551_968);
  });
  it("usa el valor catastral si es mayor que el coste", () => {
    const r = buildingAmortization({ acquisitionCostsCents: [1_000_000], landCents: 1_000_000, buildingCents: 3_000_000, rentRatio: 1 });
    expect(r.baseCents).toBe(4_000_000);
    expect(r.amortizationCents).toBe(Math.round(4_000_000 * 0.75 * 0.03));
  });
  it("ratio 0 → 0", () => {
    expect(buildingAmortization({ ...base, rentRatio: 0 }).amortizationCents).toBe(0);
  });
  it("sin valor catastral → 0", () => {
    expect(buildingAmortization({ acquisitionCostsCents: [100], landCents: 0, buildingCents: 0, rentRatio: 1 }).amortizationCents).toBe(0);
  });
});

describe("assetAmortization", () => {
  const periods: RentalPeriod[] = [{ start: "2024-02-01", end: null }];
  const items = [30_000, 25_000, 22_000, 20_726, 10_000].map((costCents, i) => ({ id: i + 1, costCents, date: "2023-10-15" }));
  const common = { items, pct: 10, periods, acq: "2023-10-02", priorDeductedById: {} as Record<number, number> };

  it("2024 → 9.860", () => {
    const r = assetAmortization({ ...common, year: 2024 });
    expect(r.totalCents).toBe(9860);
    expect(r.items).toHaveLength(5);
    expect(r.items[0].id).toBe(1);
  });
  it("2025 → 10.773", () => {
    expect(assetAmortization({ ...common, year: 2025 }).totalCents).toBe(10_773);
  });
  it("compra a mitad de año: solo días alquilados desde la compra", () => {
    const r = assetAmortization({
      ...common,
      items: [{ id: 9, costCents: 36_500, date: "2025-07-01" }],
      periods: [{ start: "2024-01-01", end: null }],
      year: 2025,
    });
    expect(r.totalCents).toBe(Math.round((36_500 * 0.1 * 184) / 365));
  });
  it("item con fecha anterior a la adquisición del inmueble usa la adquisición", () => {
    const r = assetAmortization({ ...common, items: [{ id: 1, costCents: 36_600, date: "2023-01-01" }], year: 2024 });
    expect(r.totalCents).toBe(Math.round((36_600 * 0.1 * 335) / 366));
  });
  it("compra posterior al año → 0", () => {
    const r = assetAmortization({ ...common, items: [{ id: 9, costCents: 36_500, date: "2026-01-01" }], year: 2025 });
    expect(r.totalCents).toBe(0);
  });
  it("tope acumulado: solo el pendiente", () => {
    const r = assetAmortization({
      ...common,
      items: [{ id: 1, costCents: 10_000, date: "2023-10-15" }],
      priorDeductedById: { 1: 9_500 },
      year: 2025,
    });
    expect(r.totalCents).toBe(500);
    expect(r.items[0].rawCents).toBe(500);
  });
  it("item totalmente amortizado → 0", () => {
    const r = assetAmortization({ ...common, items: [{ id: 1, costCents: 10_000, date: "2023-10-15" }], priorDeductedById: { 1: 10_000 }, year: 2025 });
    expect(r.totalCents).toBe(0);
  });
});
