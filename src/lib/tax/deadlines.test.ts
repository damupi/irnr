import { describe, expect, it } from "vitest";
import { deadlineFor, filingStatus } from "./deadlines";
import type { Filing } from "./types";

describe("deadlineFor", () => {
  it.each([
    [2024, "01", false, "2025-01-01", "2025-01-20"],
    [2025, "01", false, "2026-01-01", "2026-01-20"],
    [2026, "01", false, "2027-04-01", "2027-04-20"],
    [2026, "01", true, "2027-01-01", "2027-01-20"],
    [2023, "02", false, "2024-01-01", "2024-12-31"],
    [2025, "02", false, "2026-01-01", "2026-12-31"],
    [2026, "02", false, "2027-04-01", "2027-12-31"],
  ] as const)("%i tipo %s cuota cero=%s", (year, incomeType, resultIsZero, from, to) => {
    expect(deadlineFor({ year, incomeType, resultIsZero })).toEqual({ from, to });
  });

  it("el override tiene prioridad", () => {
    const override = { from: "2026-12-01", to: "2026-12-31" };
    expect(deadlineFor({ year: 2025, incomeType: "01", resultIsZero: false, override })).toEqual(override);
  });
  it("override null se ignora", () => {
    expect(deadlineFor({ year: 2024, incomeType: "01", resultIsZero: false, override: null }).to).toBe("2025-01-20");
  });
});

const deadline = { from: "2025-01-01", to: "2025-01-20" };
const filing = (filedAt: string): Filing => ({ year: 2024, incomeType: "01", filedAt, grossCents: 0, expensesCents: 0, baseCents: 0, taxCents: 0 });

describe("filingStatus", () => {
  it("presentado en plazo", () => {
    expect(filingStatus({ deadline, filing: filing("2025-01-15"), today: "2025-02-01" }).status).toBe("filed");
  });
  it("presentado el último día", () => {
    expect(filingStatus({ deadline, filing: filing("2025-01-20"), today: "2025-02-01" }).status).toBe("filed");
  });
  it("presentado fuera de plazo", () => {
    expect(filingStatus({ deadline, filing: filing("2025-10-12"), today: "2026-10-10" }).status).toBe("filed_late");
  });
  it("futuro", () => {
    expect(filingStatus({ deadline, filing: null, today: "2024-12-31" }).status).toBe("future");
  });
  it("pendiente dentro de plazo (primer y último día)", () => {
    expect(filingStatus({ deadline, filing: null, today: "2025-01-01" }).status).toBe("pending");
    expect(filingStatus({ deadline, filing: null, today: "2025-01-20" }).status).toBe("pending");
  });
  it("vencido: recargo 1 % en el primer mes", () => {
    expect(filingStatus({ deadline, filing: null, today: "2025-01-25" })).toEqual({ status: "overdue", surchargePct: 1, interestDue: false });
  });
  it("vencido: +1 % por mes completo", () => {
    expect(filingStatus({ deadline, filing: null, today: "2025-03-20" })).toMatchObject({ surchargePct: 3 });
    expect(filingStatus({ deadline, filing: null, today: "2025-03-19" })).toMatchObject({ surchargePct: 2 });
  });
  it("12 meses completos → 13 %", () => {
    expect(filingStatus({ deadline, filing: null, today: "2026-01-20" })).toMatchObject({ surchargePct: 13, interestDue: false });
  });
  it("más de 12 meses → 15 % + intereses", () => {
    expect(filingStatus({ deadline, filing: null, today: "2026-02-20" })).toEqual({ status: "overdue", surchargePct: 15, interestDue: true });
  });
});
