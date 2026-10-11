import { asc, and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { filings, type FilingRow } from "@/db/schema";
import type { Filing } from "@/lib/tax/types";
import { isoDate } from "./validation";

const cents = z.number().int().optional();
export const filingInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  incomeType: z.enum(["01", "02"]),
  filedAt: isoDate,
  receiptNumber: z.string().nullish(),
  grossCents: cents,
  expensesCents: cents,
  baseCents: cents,
  taxCents: cents,
  notes: z.string().nullish(),
});
export type FilingInput = z.input<typeof filingInputSchema>;

export function listFilings(db: Db): FilingRow[] {
  return db.select().from(filings).orderBy(asc(filings.year), asc(filings.incomeType)).all();
}

export function createFiling(db: Db, input: FilingInput): FilingRow {
  return db.insert(filings).values(filingInputSchema.parse(input)).returning().get();
}

export function updateFiling(db: Db, id: number, input: Partial<FilingInput>): FilingRow {
  const row = db.update(filings).set(filingInputSchema.partial().parse(input)).where(eq(filings.id, id)).returning().get();
  if (!row) throw new Error(`La declaración ${id} no existe`);
  return row;
}

export function deleteFiling(db: Db, id: number): void {
  db.delete(filings).where(eq(filings.id, id)).run();
}

export function getFiling(db: Db, year: number, incomeType: "01" | "02"): Filing | null {
  const r = db.select().from(filings).where(and(eq(filings.year, year), eq(filings.incomeType, incomeType))).get();
  if (!r) return null;
  return {
    year: r.year,
    incomeType: r.incomeType,
    filedAt: r.filedAt,
    grossCents: r.grossCents,
    expensesCents: r.expensesCents,
    baseCents: r.baseCents,
    taxCents: r.taxCents,
  };
}
