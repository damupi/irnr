import { clampRangeToYear, daysBetweenInclusive } from "@/lib/dates";
import type { RentalPeriod } from "./types";

export function daysOwned(acquisitionDate: string, year: number): number {
  const r = clampRangeToYear({ start: acquisitionDate, end: null }, year);
  return r ? daysBetweenInclusive(r.start, r.end) : 0;
}

/** Días del año cubiertos por la unión de contratos, desde `acquisitionDate` (o la fecha que se pase). */
export function daysRented(periods: RentalPeriod[], acquisitionDate: string, year: number): number {
  const ranges = periods
    .map((p) => clampRangeToYear({ start: p.start > acquisitionDate ? p.start : acquisitionDate, end: p.end }, year))
    .filter((r): r is { start: string; end: string } => r !== null)
    .sort((a, b) => a.start.localeCompare(b.start));

  let total = 0;
  let coveredUntil = "";
  for (const r of ranges) {
    const start = r.start > coveredUntil ? r.start : nextDay(coveredUntil);
    if (r.end >= start) {
      total += daysBetweenInclusive(start, r.end);
      coveredUntil = r.end;
    }
  }
  return total;
}

export function daysImputed(
  periods: RentalPeriod[],
  acquisitionDate: string,
  year: number,
  override: number | null,
): number {
  if (override !== null) return override;
  return daysOwned(acquisitionDate, year) - daysRented(periods, acquisitionDate, year);
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

