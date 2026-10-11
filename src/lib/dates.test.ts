import { describe, expect, it } from "vitest";
import { addMonths, clampRangeToYear, daysBetweenInclusive, daysInYear, formatDateEs, parseDateEs } from "./dates";

describe("parseDateEs", () => {
  it.each([
    ["9/10/2023", "2023-10-09"],
    ["02/10/2023", "2023-10-02"],
    ["2/01/2026", "2026-01-02"],
  ])("%s -> %s", (i, o) => expect(parseDateEs(i)).toBe(o));
  it.each(["", "31/02/2024", "2024-01-01", "1/13/2024", "a/b/c"])("lanza con %j", (i) => {
    expect(() => parseDateEs(i)).toThrow();
  });
});

describe("daysInYear", () => {
  it("bisiestos", () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2025)).toBe(365);
    expect(daysInYear(1900)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
  });
});

describe("daysBetweenInclusive", () => {
  it("cuenta ambos extremos", () => {
    expect(daysBetweenInclusive("2024-02-01", "2024-12-31")).toBe(335);
    expect(daysBetweenInclusive("2024-01-01", "2024-01-01")).toBe(1);
  });
  it("0 si end < start", () => {
    expect(daysBetweenInclusive("2024-02-02", "2024-02-01")).toBe(0);
  });
});

describe("clampRangeToYear", () => {
  it("recorta al año", () => {
    expect(clampRangeToYear({ start: "2023-05-01", end: "2025-02-01" }, 2024)).toEqual({ start: "2024-01-01", end: "2024-12-31" });
    expect(clampRangeToYear({ start: "2024-02-01", end: "2026-01-31" }, 2024)).toEqual({ start: "2024-02-01", end: "2024-12-31" });
    expect(clampRangeToYear({ start: "2024-02-01", end: "2024-03-01" }, 2024)).toEqual({ start: "2024-02-01", end: "2024-03-01" });
  });
  it("end null = 31/12", () => {
    expect(clampRangeToYear({ start: "2026-02-01", end: null }, 2026)).toEqual({ start: "2026-02-01", end: "2026-12-31" });
  });
  it("null si no intersecta", () => {
    expect(clampRangeToYear({ start: "2026-02-01", end: null }, 2025)).toBeNull();
    expect(clampRangeToYear({ start: "2020-02-01", end: "2022-01-01" }, 2024)).toBeNull();
  });
});

describe("addMonths", () => {
  it("suma meses recortando al fin de mes", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2024-01-31", 2)).toBe("2024-03-31");
    expect(addMonths("2023-11-15", 3)).toBe("2024-02-15");
    expect(addMonths("2024-03-15", 12)).toBe("2025-03-15");
    expect(addMonths("2024-12-01", 1)).toBe("2025-01-01");
  });
});

describe("formatDateEs", () => {
  it("dd/mm/aaaa", () => {
    expect(formatDateEs("2024-02-01")).toBe("01/02/2024");
    expect(formatDateEs("2026-10-10")).toBe("10/10/2026");
  });
});
