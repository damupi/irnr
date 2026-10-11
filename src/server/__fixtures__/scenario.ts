import type { Db } from "@/db/client";
import { seedCategories, findCategory } from "../categories";
import { createFiling } from "../filings";
import { saveProperty, upsertYearParams } from "../properties";
import { createRentalPeriod, generateIncomeFromRental } from "../rentals";
import { createTransaction } from "../transactions";

export const TODAY = "2026-10-10";

/** Escenario sintético basado en los valores de referencia del PRD §5.7 (importes en céntimos). */
export function seedScenario(db: Db, opts: { withFiling?: boolean; initialCarryforwardCents?: number } = {}) {
  seedCategories(db);
  const cat = (a: string, b: string) => findCategory(db, a, b)!.id;
  saveProperty(db, { alias: "Piso", acquisitionDate: "2023-10-02", cadastralRef: "0000000XX0000X0000XX" });
  const land = 863_269;
  const building = 1_688_699;
  upsertYearParams(db, { year: 2023, cadastralLandCents: land, cadastralBuildingCents: building, daysImputedOverride: 90, initialCarryforwardCents: opts.initialCarryforwardCents });
  for (const year of [2024, 2025, 2026]) upsertYearParams(db, { year, cadastralLandCents: land, cadastralBuildingCents: building });

  const r1 = createRentalPeriod(db, { tenant: "Inquilino 1", startDate: "2024-02-01", endDate: "2026-01-31", monthlyRentCents: 78_000 });
  const r2 = createRentalPeriod(db, { tenant: "Inquilino 2", startDate: "2026-02-01", endDate: "2027-01-31", monthlyRentCents: 96_000 });
  generateIncomeFromRental(db, r1.id, { until: TODAY });
  generateIncomeFromRental(db, r2.id, { until: TODAY });

  const add = (date: string, amountCents: number, concept: string, c1: string, c2: string, extra = {}) =>
    createTransaction(db, { date, kind: "expense", amountCents, concept, categoryId: cat(c1, c2), hasInvoice: true, ...extra });

  const acquisition: [string, number][] = [
    ["precio de compra", 20_000_000], ["ITP", 1_200_000], ["intermediacion inmobiliaria", 270_000],
    ["notaria", 37_033], ["registro", 35_547], ["gestoria", 48_400],
  ];
  for (const [c2, amount] of acquisition) add("2023-10-02", amount, c2, "adquisicion", c2);
  add("2023-10-02", 13_310, "mensajeria", "adquisicion", "gestoria");

  add("2023-10-20", 135_938, "Reformas", "gastos", "reparacion y conservacion");
  add("2023-10-25", 18_520, "Licencia de obras", "gastos", "reparacion y conservacion");

  for (let m = 1; m <= 12; m++) {
    add(`2024-${String(m).padStart(2, "0")}-05`, m === 12 ? 32_673 : 32_700, "Intereses hipoteca", "gastos", "intereses hipoteca");
  }
  [30_000, 25_000, 22_000, 20_726, 10_000].forEach((a, i) => add("2023-10-15", a, `Mueble ${i + 1}`, "amortizaciones", "muebles y electrodomesticos"));

  if (opts.withFiling) {
    createFiling(db, { year: 2024, incomeType: "01", filedAt: "2025-10-12", grossCents: 936_000, expensesCents: 894_000, baseCents: 42_000, taxCents: 7_980 });
    createFiling(db, { year: 2023, incomeType: "02", filedAt: "2024-12-31", baseCents: 12_585, taxCents: 2_391 });
  }
}
