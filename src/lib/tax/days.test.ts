import { describe, expect, it } from "vitest";
import { daysImputed, daysOwned, daysRented } from "./days";
import type { RentalPeriod } from "./types";

const ACQ = "2023-10-02";
const REAL: RentalPeriod[] = [
  { start: "2024-02-01", end: "2026-01-31" },
  { start: "2026-02-01", end: "2027-01-31" },
];

describe("daysOwned", () => {
  it("año de compra, año completo y año anterior", () => {
    expect(daysOwned(ACQ, 2023)).toBe(91);
    expect(daysOwned(ACQ, 2024)).toBe(366);
    expect(daysOwned(ACQ, 2022)).toBe(0);
  });
});

describe("daysRented", () => {
  it("contratos reales", () => {
    expect(daysRented(REAL, ACQ, 2024)).toBe(335);
    expect(daysRented(REAL, ACQ, 2025)).toBe(365);
    expect(daysRented(REAL, ACQ, 2026)).toBe(365);
    expect(daysRented(REAL, ACQ, 2023)).toBe(0);
  });
  it("los solapes no cuentan doble", () => {
    const overlap: RentalPeriod[] = [
      { start: "2024-01-01", end: "2024-06-30" },
      { start: "2024-05-01", end: "2024-12-31" },
      { start: "2024-03-01", end: "2024-04-01" },
    ];
    expect(daysRented(overlap, ACQ, 2024)).toBe(366);
  });
  it("un hueco entre contratos se descuenta", () => {
    const gap: RentalPeriod[] = [
      { start: "2025-01-01", end: "2025-03-31" },
      { start: "2025-05-01", end: "2025-12-31" },
    ];
    expect(daysRented(gap, ACQ, 2025)).toBe(365 - 30);
  });
  it("recorta contratos anteriores a la compra", () => {
    expect(daysRented([{ start: "2023-01-01", end: null }], ACQ, 2023)).toBe(91);
  });
  it("end null = vigente hasta 31/12", () => {
    expect(daysRented([{ start: "2026-02-01", end: null }], ACQ, 2026)).toBe(334);
  });
  it("sin contratos", () => {
    expect(daysRented([], ACQ, 2024)).toBe(0);
  });
});

describe("daysImputed", () => {
  it("owned - rented", () => {
    expect(daysImputed(REAL, ACQ, 2024, null)).toBe(31);
    expect(daysImputed(REAL, ACQ, 2025, null)).toBe(0);
    expect(daysImputed(REAL, ACQ, 2023, null)).toBe(91);
  });
  it("override", () => {
    expect(daysImputed(REAL, ACQ, 2023, 90)).toBe(90);
    expect(daysImputed(REAL, ACQ, 2025, 0)).toBe(0);
  });
});
