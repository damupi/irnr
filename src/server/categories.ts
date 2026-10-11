import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { categories, transactions, type Category } from "@/db/schema";
import type { Treatment } from "@/lib/tax/types";

type Seed = { cat1: string; cat2: string; treatment: Treatment; box: number | null; prorate: boolean; help: string };

const s = (cat1: string, cat2: string, treatment: Treatment, box: number | null, prorate: boolean, help: string): Seed => ({
  cat1, cat2, treatment, box, prorate, help,
});

/** Categorías semilla (PRD §8). */
export const SEED_CATEGORIES: Seed[] = [
  s("ingresos", "alquiler", "income", null, false, "Renta mensual cobrada. Computa como rendimiento íntegro en el mes al que corresponde."),
  s("ingresos", "repercusion suministros", "income", null, false, "Suministros repercutidos al inquilino: computan como ingreso."),
  s("ingresos", "fianza", "non_taxable_income", null, false, "La fianza recibida no computa como ingreso."),
  s("ingresos", "otros ingresos", "income", null, false, "Otros ingresos del inmueble."),
  s("adquisicion", "precio de compra", "acquisition_cost", 14, false, "Coste de adquisición: base de la amortización del inmueble (3 %)."),
  s("adquisicion", "ITP", "acquisition_cost", 14, false, "Impuesto de transmisiones: forma parte del coste de adquisición."),
  s("adquisicion", "notaria", "acquisition_cost", 14, false, "Notaría de la compra: coste de adquisición."),
  s("adquisicion", "registro", "acquisition_cost", 14, false, "Registro de la propiedad: coste de adquisición."),
  s("adquisicion", "gestoria", "acquisition_cost", 14, false, "Gestoría de la compra: coste de adquisición."),
  s("adquisicion", "intermediacion inmobiliaria", "acquisition_cost", 14, false, "Comisión de intermediación en la compra: coste de adquisición."),
  s("gastos", "intereses hipoteca", "capped_1_4", null, true, "Intereses pagados. Límite conjunto con reparación (casillas 1–4); exceso arrastrable 4 años. Prorrateo por días alquilados."),
  s("gastos", "gastos financiacion prestamo", "capped_1_4", null, true, "Comisiones de financiación (incl. amortización anticipada). Límite casillas 1–4."),
  s("gastos", "reparacion y conservacion", "capped_1_4", null, false, "Reparación y conservación. Límite casillas 1–4; sin prorrateo; arrastrable 4 años."),
  s("gastos", "comunidad", "deductible", 5, true, "Cuotas de la comunidad de propietarios. Casilla 5, prorrateo por días alquilados."),
  s("gastos", "formalizacion contrato", "deductible", 6, false, "Gastos de formalización del contrato (p. ej. honorarios de la agencia). Casilla 6."),
  s("gastos", "defensa juridica", "deductible", 7, false, "Gastos de defensa jurídica. Casilla 7."),
  s("gastos", "gestion y administracion", "deductible", 8, false, "Servicios personales de gestión/administración de terceros. Casilla 8."),
  s("gastos", "seguros", "deductible", 10, true, "Primas de seguros (hogar, impago). Casilla 10, prorrateo."),
  s("gastos", "impuestos", "deductible", 11, true, "IBI, tasas y recargos (no sanciones). Casilla 11, prorrateo."),
  s("gastos", "saldos dudoso cobro", "deductible", 12, false, "Saldos de dudoso cobro. Casilla 12."),
  s("gastos", "otros deducibles", "deductible", 16, false, "Otros gastos fiscalmente deducibles. Casilla 16."),
  s("suministros", "agua", "deductible", 9, true, "Suministros a cargo del propietario. Casilla 9, prorrateo."),
  s("suministros", "luz", "deductible", 9, true, "Suministros a cargo del propietario. Casilla 9, prorrateo."),
  s("suministros", "gas", "deductible", 9, true, "Suministros a cargo del propietario. Casilla 9, prorrateo."),
  s("suministros", "internet", "deductible", 9, true, "Suministros a cargo del propietario. Casilla 9, prorrateo."),
  s("amortizaciones", "muebles y electrodomesticos", "furniture_10", 13, false, "Mobiliario y electrodomésticos: amortización 10 % anual (casilla 13), hasta agotar el coste."),
  s("amortizaciones", "mejoras", "improvement_3", 15, false, "Mejoras del inmueble: amortización 3 % anual (casilla 15)."),
  s("no deducible", "amortizacion capital prestamo", "non_deductible", null, false, "Capital de la hipoteca (ordinario o anticipado): no deducible."),
  s("no deducible", "deposito y devolucion de fianza", "non_deductible", null, false, "Depósito de la fianza en la Generalitat y su devolución: no deducible."),
  s("no deducible", "uso personal", "non_deductible", null, false, "Gastos de uso personal: no deducibles."),
  s("no deducible", "sanciones y recargos", "non_deductible", null, false, "Sanciones y recargos: no deducibles."),
  s("no deducible", "impuesto IRNR", "non_deductible", null, false, "El propio IRNR no es deducible."),
  s("no deducible", "fondo de reserva comunidad", "non_deductible", null, false, "Aportación al fondo de reserva de la comunidad: no se deduce (criterio del propietario)."),
  s("no deducible", "otros", "non_deductible", null, false, "Otros movimientos sin efecto fiscal."),
];

export const TREATMENTS = [
  "income", "non_taxable_income", "capped_1_4", "deductible", "acquisition_cost", "furniture_10", "improvement_3", "non_deductible",
] as const;

export const categoryInputSchema = z.object({
  cat1: z.string().trim().min(1),
  cat2: z.string().trim().min(1),
  treatment: z.enum(TREATMENTS),
  box: z.number().int().min(1).max(17).nullable(),
  prorate: z.boolean(),
  help: z.string().nullable(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export function seedCategories(db: Db): void {
  db.insert(categories).values(SEED_CATEGORIES).onConflictDoNothing().run();
}

export function listCategories(db: Db): Category[] {
  return db.select().from(categories).orderBy(categories.cat1, categories.cat2).all();
}

export function findCategory(db: Db, cat1: string, cat2: string): Category | null {
  return db.select().from(categories).where(and(eq(categories.cat1, cat1), eq(categories.cat2, cat2))).get() ?? null;
}

export function createCategory(db: Db, input: CategoryInput): Category {
  return db.insert(categories).values(categoryInputSchema.parse(input)).returning().get();
}

export function updateCategory(db: Db, id: number, input: Partial<CategoryInput>): Category {
  const row = db.update(categories).set(categoryInputSchema.partial().parse(input)).where(eq(categories.id, id)).returning().get();
  if (!row) throw new Error(`La categoría ${id} no existe`);
  return row;
}

export function deleteCategory(db: Db, id: number): void {
  const used = db.select({ n: sql<number>`count(*)` }).from(transactions).where(eq(transactions.categoryId, id)).get()!.n;
  if (used > 0) throw new Error(`La categoría está en uso por ${used} movimientos`);
  db.delete(categories).where(eq(categories.id, id)).run();
}
