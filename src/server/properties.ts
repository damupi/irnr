import { desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { properties, propertyYearParams, type Property, type YearParamsRow } from "@/db/schema";
import type { YearParams } from "@/lib/tax/types";
import { isoDate } from "./validation";

export const propertyInputSchema = z.object({
  alias: z.string().trim().min(1),
  address: z.string().nullish(),
  cadastralRef: z.string().nullish(),
  acquisitionDate: isoDate,
  ownershipPct: z.number().gt(0).max(100).optional(),
  residenceCountry: z.string().trim().min(2).optional(),
  taxRatePct: z.number().min(0).max(100).optional(),
});

export const yearParamsInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  cadastralLandCents: z.number().int().min(0),
  cadastralBuildingCents: z.number().int().min(0),
  imputationRatePct: z.number().min(0).max(100).optional(),
  initialCarryforwardCents: z.number().int().min(0).optional(),
  deadlineOverrideFrom: isoDate.nullish(),
  deadlineOverrideTo: isoDate.nullish(),
  daysImputedOverride: z.number().int().min(0).max(366).nullish(),
});
export type YearParamsInput = z.input<typeof yearParamsInputSchema>;

export function getProperty(db: Db): Property | null {
  return db.select().from(properties).orderBy(properties.id).limit(1).get() ?? null;
}

export function mustGetProperty(db: Db): Property {
  const p = getProperty(db);
  if (!p) throw new Error("No hay inmueble configurado");
  return p;
}

export function saveProperty(db: Db, input: z.input<typeof propertyInputSchema>): Property {
  const data = propertyInputSchema.parse(input);
  const existing = getProperty(db);
  if (!existing) return db.insert(properties).values(data).returning().get();
  return db.update(properties).set(data).where(eq(properties.id, existing.id)).returning().get();
}

export function upsertYearParams(db: Db, input: YearParamsInput): YearParamsRow {
  const data = yearParamsInputSchema.parse(input);
  const property = mustGetProperty(db);
  return db
    .insert(propertyYearParams)
    .values({ ...data, propertyId: property.id })
    .onConflictDoUpdate({ target: [propertyYearParams.propertyId, propertyYearParams.year], set: data })
    .returning()
    .get();
}

export function listYearParams(db: Db): YearParamsRow[] {
  return db.select().from(propertyYearParams).orderBy(propertyYearParams.year).all();
}

function toEngine(r: YearParamsRow, year: number, inherited: boolean): YearParams {
  return {
    year,
    cadastralLandCents: r.cadastralLandCents,
    cadastralBuildingCents: r.cadastralBuildingCents,
    imputationRatePct: r.imputationRatePct,
    initialCarryforwardCents: inherited ? 0 : r.initialCarryforwardCents,
    daysImputedOverride: inherited ? null : r.daysImputedOverride,
    deadlineOverride:
      !inherited && r.deadlineOverrideFrom && r.deadlineOverrideTo
        ? { from: r.deadlineOverrideFrom, to: r.deadlineOverrideTo }
        : null,
  };
}

/** Parámetros del ejercicio; si no existen hereda los del último año anterior. */
export function getYearParams(db: Db, year: number): YearParams | null {
  const exact = db.select().from(propertyYearParams).where(eq(propertyYearParams.year, year)).get();
  if (exact) return toEngine(exact, year, false);
  const prev = db
    .select()
    .from(propertyYearParams)
    .where(lt(propertyYearParams.year, year))
    .orderBy(desc(propertyYearParams.year))
    .limit(1)
    .get();
  return prev ? toEngine(prev, year, true) : null;
}
