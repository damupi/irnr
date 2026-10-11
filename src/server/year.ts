import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { filings } from "@/db/schema";

/** Año en curso − 1 si su 210 no está presentado; si no, el año en curso (PRD §4.1). */
export function defaultYear(db: Db, today: string): number {
  const current = Number(today.slice(0, 4));
  const filed = db.select().from(filings).where(eq(filings.year, current - 1)).all().length > 0;
  return filed ? current : current - 1;
}

export function parseYear(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : fallback;
}
