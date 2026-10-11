import { and, eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { openDb, type Db } from "../src/db/client";
import { rentalPeriods, transactions } from "../src/db/schema";
import { findCategory, seedCategories } from "../src/server/categories";
import { createFiling, getFiling } from "../src/server/filings";
import { saveProperty, upsertYearParams } from "../src/server/properties";
import { createRentalPeriod, generateIncomeFromRental } from "../src/server/rentals";

const LAND_CENTS = 863_269; // 8.632,69 €
const BUILDING_CENTS = 1_688_699; // 16.886,99 €

/** Datos fijos: categorías, inmueble, parámetros 2023–2026, contratos y declaraciones presentadas. Idempotente. */
export function seed(db: Db, opts: { demo?: boolean; today?: string } = {}): void {
  seedCategories(db);
  saveProperty(db, {
    alias: "Piso",
    cadastralRef: "0000000XX0000X0000XX",
    acquisitionDate: "2023-10-02",
    ownershipPct: 100,
    residenceCountry: "DE",
    taxRatePct: 19,
  });
  for (const year of [2023, 2024, 2025, 2026]) {
    upsertYearParams(db, {
      year,
      cadastralLandCents: LAND_CENTS,
      cadastralBuildingCents: BUILDING_CENTS,
      imputationRatePct: 2,
      daysImputedOverride: year === 2023 ? 90 : null,
    });
  }

  const ensureRental = (input: Parameters<typeof createRentalPeriod>[1]) => {
    const existing = db.select().from(rentalPeriods).where(eq(rentalPeriods.startDate, input.startDate)).get();
    return existing ?? createRentalPeriod(db, input);
  };
  const r1 = ensureRental({
    tenant: "Inquilino 1", startDate: "2024-02-01", endDate: "2026-01-31", monthlyRentCents: 78_000,
    agency: "Agencia", notes: "Rescisión firmada 14/01/2026",
  });
  const r2 = ensureRental({
    tenant: "Inquilino 2", startDate: "2026-02-01", endDate: "2027-01-31", monthlyRentCents: 96_000,
    notes: "Prórroga anual tácita hasta 5 años; IBI y comunidad incluidos; IPC anual",
  });

  if (!getFiling(db, 2023, "02")) {
    createFiling(db, {
      year: 2023, incomeType: "02", filedAt: "2024-12-31", baseCents: 12_585, taxCents: 2_391,
      notes: "Fecha de presentación desconocida: 2024-12-31 es un valor provisional",
    });
  }
  if (!getFiling(db, 2024, "01")) {
    createFiling(db, {
      year: 2024, incomeType: "01", filedAt: "2025-10-12", grossCents: 936_000, expensesCents: 894_000,
      baseCents: 42_000, taxCents: 7_980, notes: "Agrupación anual 0A. Presentado fuera de plazo.",
    });
  }

  if (opts.demo) seedDemo(db, opts.today ?? "2026-10-10", [r1.id, r2.id]);
}

function seedDemo(db: Db, today: string, rentalIds: number[]): void {
  for (const id of rentalIds) generateIncomeFromRental(db, id, { until: today });

  let n = 0;
  const add = (date: string, amountCents: number, concept: string, category: [string, string] | null, extra: { hasInvoice?: boolean; frequency?: "unica" | "mensual" | "trimestral" | "anual" } = {}) => {
    n += 1;
    const categoryId = category ? findCategory(db, category[0], category[1])!.id : null;
    const exists = db.select().from(transactions).where(and(eq(transactions.externalKey, `demo:${n}`))).get();
    if (exists) return;
    db.insert(transactions).values({
      date, kind: "expense", amountCents, concept, categoryId, hasInvoice: extra.hasInvoice ?? true,
      frequency: extra.frequency ?? "unica", payee: "Proveedor demo", source: "import", externalKey: `demo:${n}`,
    }).run();
  };

  const acquisition: [string, number][] = [
    ["precio de compra", 20_000_000], ["ITP", 1_200_000], ["intermediacion inmobiliaria", 270_000],
    ["notaria", 37_033], ["registro", 35_547], ["gestoria", 61_710],
  ];
  for (const [c2, amount] of acquisition) add("2023-10-02", amount, `Demo ${c2}`, ["adquisicion", c2]);
  add("2023-10-20", 135_938, "Demo reformas", ["gastos", "reparacion y conservacion"]);
  add("2023-10-25", 18_520, "Demo licencia de obras", ["gastos", "reparacion y conservacion"]);
  [30_000, 25_000, 22_000, 20_726, 10_000].forEach((a, i) => add("2023-10-15", a, `Demo mueble ${i + 1}`, ["amortizaciones", "muebles y electrodomesticos"]));

  for (const [year, months, amount] of [[2024, 12, 32_700], [2025, 12, 26_900], [2026, 9, 25_000]] as const) {
    for (let m = 1; m <= months; m++) {
      add(`${year}-${String(m).padStart(2, "0")}-05`, amount, `Demo intereses hipoteca ${year}-${m}`, ["gastos", "intereses hipoteca"], { hasInvoice: false, frequency: "mensual" });
    }
  }
  add("2024-01-15", 78_000, "Demo honorarios agencia", ["gastos", "formalizacion contrato"]);
  add("2024-03-01", 23_501, "Demo seguro hogar", ["gastos", "seguros"], { frequency: "anual" });
  add("2025-04-30", 14_466, "Demo IBI 2025", ["gastos", "impuestos"]);
  add("2026-04-30", 14_466, "Demo IBI 2026", ["gastos", "impuestos"]);
  add("2025-05-10", 40_000, "Demo pintura", null);
  add("2025-06-02", 7_000, "Demo antena", null);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) {
  const demo = process.argv.includes("--demo");
  seed(openDb(), { demo, today: process.env.IRNR_TODAY });
  console.log(demo ? "Seed (demo) aplicado" : "Seed aplicado");
}
