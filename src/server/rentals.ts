import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { rentalPeriods, transactions, type RentalPeriodRow } from "@/db/schema";
import { addMonths } from "@/lib/dates";
import { findCategory } from "./categories";
import { mustGetProperty } from "./properties";
import { isoDate } from "./validation";

export const rentalInputSchema = z.object({
  tenant: z.string().nullish(),
  startDate: isoDate,
  endDate: isoDate.nullish(),
  monthlyRentCents: z.number().int().positive(),
  agency: z.string().nullish(),
  notes: z.string().nullish(),
});
export type RentalInput = z.input<typeof rentalInputSchema>;

function checkRange(start: string, end: string | null | undefined) {
  if (end && end < start) throw new Error("La fecha de fin es anterior a la de inicio");
}

export function listRentalPeriods(db: Db): RentalPeriodRow[] {
  return db.select().from(rentalPeriods).orderBy(asc(rentalPeriods.startDate)).all();
}

export function getRentalPeriod(db: Db, id: number): RentalPeriodRow | null {
  return db.select().from(rentalPeriods).where(eq(rentalPeriods.id, id)).get() ?? null;
}

export function createRentalPeriod(db: Db, input: RentalInput): RentalPeriodRow {
  const data = rentalInputSchema.parse(input);
  checkRange(data.startDate, data.endDate);
  const property = mustGetProperty(db);
  return db.insert(rentalPeriods).values({ ...data, propertyId: property.id }).returning().get();
}

export function updateRentalPeriod(db: Db, id: number, input: Partial<RentalInput>): RentalPeriodRow {
  const current = getRentalPeriod(db, id);
  if (!current) throw new Error(`El contrato ${id} no existe`);
  const data = rentalInputSchema.partial().parse(input);
  checkRange(data.startDate ?? current.startDate, data.endDate === undefined ? current.endDate : data.endDate);
  return db.update(rentalPeriods).set(data).where(eq(rentalPeriods.id, id)).returning().get();
}

export function deleteRentalPeriod(db: Db, id: number): void {
  db.delete(rentalPeriods).where(eq(rentalPeriods.id, id)).run();
}

/**
 * Crea una renta por mes devengado (fecha = día 1) hasta min(fin, until). Idempotente vía external_key.
 * Devuelve cuántas filas nuevas se crearon.
 */
export function generateIncomeFromRental(db: Db, rentalPeriodId: number, opts: { until: string }): number {
  const rental = getRentalPeriod(db, rentalPeriodId);
  if (!rental) throw new Error(`El contrato ${rentalPeriodId} no existe`);
  const category = findCategory(db, "ingresos", "alquiler");
  if (!category) throw new Error("Falta la categoría ingresos / alquiler");

  const limit = rental.endDate && rental.endDate < opts.until ? rental.endDate : opts.until;
  let created = 0;
  for (let month = `${rental.startDate.slice(0, 7)}-01`; month <= limit; month = addMonths(month, 1)) {
    const ym = month.slice(0, 7);
    const rows = db
      .insert(transactions)
      .values({
        date: month,
        kind: "income",
        amountCents: rental.monthlyRentCents,
        payee: rental.tenant,
        concept: `Alquiler ${ym}`,
        categoryId: category.id,
        source: "contract",
        externalKey: `rental:${rental.id}:${ym}`,
      })
      .onConflictDoNothing()
      .returning({ id: transactions.id })
      .all();
    created += rows.length;
  }
  return created;
}
