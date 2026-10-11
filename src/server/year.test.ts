import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { createFiling } from "./filings";
import { defaultYear, parseYear } from "./year";

describe("defaultYear", () => {
  it("año anterior si su 210 no está presentado", () => {
    expect(defaultYear(createTestDb(), "2026-10-10")).toBe(2025);
  });
  it("año en curso si el anterior ya está presentado (cualquier tipo)", () => {
    const db = createTestDb();
    createFiling(db, { year: 2025, incomeType: "01", filedAt: "2026-01-15" });
    expect(defaultYear(db, "2026-10-10")).toBe(2026);
  });
  it("tipo 02 presentado también cuenta", () => {
    const db = createTestDb();
    createFiling(db, { year: 2025, incomeType: "02", filedAt: "2026-01-15" });
    expect(defaultYear(db, "2026-10-10")).toBe(2026);
  });
});

describe("parseYear", () => {
  it("valida el query param", () => {
    expect(parseYear("2024", 2025)).toBe(2024);
    expect(parseYear(undefined, 2025)).toBe(2025);
    expect(parseYear("abc", 2025)).toBe(2025);
    expect(parseYear("1850", 2025)).toBe(2025);
    expect(parseYear(["2024", "2023"], 2025)).toBe(2024);
  });
});
