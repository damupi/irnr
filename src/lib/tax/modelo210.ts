import { daysInYear } from "@/lib/dates";
import { assetAmortization, buildingAmortization, type AssetAmortizationItem, type BuildingAmortization } from "./amortization";
import { applyCappedLimit } from "./carryforward";
import { deadlineFor } from "./deadlines";
import { daysImputed, daysOwned, daysRented } from "./days";
import type { Deadline, PendingExcess, PropertyInput, RentalPeriod, TaxTransaction, YearParams } from "./types";

export interface ComputeInput {
  property: PropertyInput;
  params: YearParams;
  periods: RentalPeriod[];
  transactions: TaxTransaction[];
  pendingCarryforward: PendingExcess[];
  /** Amortización ya deducida en años anteriores, por id de movimiento (muebles y mejoras). */
  priorAssetDeductions: Record<number, number>;
  year: number;
  today: string;
}

export interface BoxDetail {
  txId: number;
  rawCents: number;
  computedCents: number;
}

export interface Rendimientos {
  grossCents: number;
  boxes: Record<number, number>;
  baseCents: number;
  taxCents: number;
  detail: Record<number, BoxDetail[]>;
}

export interface Imputada {
  cadastralTotalCents: number;
  ratePct: number;
  days: number;
  baseCents: number;
  taxCents: number;
}

export interface TaxYearResult {
  year: number;
  days: { inYear: number; owned: number; rented: number; imputed: number };
  rentRatio: number;
  rendimientos: Rendimientos | null;
  imputada: Imputada | null;
  carryforward: { generated: number; applied: number; pending: PendingExcess[]; expired: PendingExcess[] };
  amortization: {
    building: BuildingAmortization;
    furniture: AssetAmortizationItem[];
    improvements: AssetAmortizationItem[];
  };
  deadlines: { rendimientos: Deadline | null; imputada: Deadline | null };
  warnings: string[];
}

const OTHER_BOX = 16;
const DIRECT_BOXES = [5, 6, 7, 8, 9, 10, 11, 12, 16];
const taxYearOf = (t: TaxTransaction) => t.taxYearOverride ?? Number(t.date.slice(0, 4));
const yearOfDate = (t: TaxTransaction) => Number(t.date.slice(0, 4));

export function computeTaxYear(input: ComputeInput): TaxYearResult {
  const { property, params, periods, year } = input;
  const inYear = daysInYear(year);
  const owned = daysOwned(property.acquisitionDate, year);
  const rented = daysRented(periods, property.acquisitionDate, year);
  const imputed = daysImputed(periods, property.acquisitionDate, year, params.daysImputedOverride);
  const rentRatio = rented / inYear;
  const own = property.ownershipPct / 100;
  const taxRate = property.taxRatePct / 100;

  const yearTxs = input.transactions.filter((t) => taxYearOf(t) === year);
  const warnings: string[] = [];
  const uncategorized = yearTxs.filter((t) => t.treatment === null).length;
  if (uncategorized > 0) warnings.push(`${uncategorized} ${uncategorized === 1 ? "movimiento sin categoría" : "movimientos sin categoría"}`);
  if (year > Number(input.today.slice(0, 4))) warnings.push("Ejercicio futuro: datos provisionales");

  const computed = (t: TaxTransaction) => (t.amountCents * t.allocationPct) / 100 * (t.prorate ? rentRatio : 1) * own;
  const detailOf = (txs: TaxTransaction[]): BoxDetail[] =>
    txs.map((t) => ({ txId: t.id, rawCents: t.amountCents, computedCents: Math.round(computed(t)) }));
  const sum = (txs: TaxTransaction[]) => txs.reduce((a, t) => a + computed(t), 0);

  // Amortizaciones
  const acquisitionTxs = input.transactions.filter((t) => t.treatment === "acquisition_cost" && yearOfDate(t) <= year);
  const building = buildingAmortization({
    acquisitionCostsCents: acquisitionTxs.map((t) => t.amountCents),
    landCents: params.cadastralLandCents,
    buildingCents: params.cadastralBuildingCents,
    rentRatio: rentRatio * own,
  });
  const assets = (treatment: "furniture_10" | "improvement_3", pct: number) =>
    assetAmortization({
      items: input.transactions
        .filter((t) => t.treatment === treatment && yearOfDate(t) <= year)
        .map((t) => ({ id: t.id, costCents: (t.amountCents * t.allocationPct) / 100 * own, date: t.date })),
      pct,
      year,
      periods,
      acq: property.acquisitionDate,
      priorDeductedById: input.priorAssetDeductions,
    });
  const furniture = assets("furniture_10", 10);
  const improvements = assets("improvement_3", 3);

  // Íntegros y límite conjunto casillas 1–4
  const incomeTxs = yearTxs.filter((t) => t.treatment === "income");
  const grossCents = rented > 0 ? Math.round(incomeTxs.reduce((a, t) => a + t.amountCents * own, 0)) : 0;
  const cappedTxs = yearTxs.filter((t) => t.treatment === "capped_1_4");
  const limit = applyCappedLimit({
    grossIncomeCents: grossCents,
    currentCappedCents: Math.round(sum(cappedTxs)),
    pending: input.pendingCarryforward,
    year,
  });

  let rendimientos: Rendimientos | null = null;
  if (rented > 0) {
    const boxes: Record<number, number> = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, 0]));
    const detail: Record<number, BoxDetail[]> = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, []]));
    Object.assign(boxes, { 1: limit.box1, 2: limit.box2, 3: limit.box3, 4: limit.box4, 13: furniture.totalCents, 14: building.amortizationCents, 15: improvements.totalCents });
    detail[3] = detailOf(cappedTxs);
    detail[13] = furniture.items.map((i) => ({ txId: i.id, rawCents: i.costCents, computedCents: Math.round(i.rawCents) }));
    detail[15] = improvements.items.map((i) => ({ txId: i.id, rawCents: i.costCents, computedCents: Math.round(i.rawCents) }));

    const deductible = yearTxs.filter((t) => t.treatment === "deductible");
    for (const box of DIRECT_BOXES) {
      const txs = deductible.filter((t) => (t.box ?? OTHER_BOX) === box);
      boxes[box] = Math.round(sum(txs));
      detail[box] = detailOf(txs);
    }
    boxes[17] = boxes[2] + boxes[4] + [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].reduce((a, b) => a + boxes[b], 0);
    const baseCents = Math.max(0, grossCents - boxes[17]);
    rendimientos = { grossCents, boxes, baseCents, taxCents: Math.round(baseCents * taxRate), detail };
  }

  let imputada: Imputada | null = null;
  if (imputed > 0) {
    const cadastralTotalCents = params.cadastralLandCents + params.cadastralBuildingCents;
    const baseCents = Math.round(((cadastralTotalCents * params.imputationRatePct) / 100) * (imputed / inYear) * own);
    imputada = { cadastralTotalCents, ratePct: params.imputationRatePct, days: imputed, baseCents, taxCents: Math.round(baseCents * taxRate) };
  }

  const override = params.deadlineOverride;
  return {
    year,
    days: { inYear, owned, rented, imputed },
    rentRatio,
    rendimientos,
    imputada,
    carryforward: {
      generated: limit.box3 - limit.box4,
      applied: limit.box2 + limit.box4,
      pending: limit.newPending,
      expired: limit.expired,
    },
    amortization: { building, furniture: furniture.items, improvements: improvements.items },
    deadlines: {
      rendimientos: rendimientos
        ? deadlineFor({ year, incomeType: "01", resultIsZero: rendimientos.taxCents === 0, override })
        : null,
      imputada: imputada ? deadlineFor({ year, incomeType: "02", resultIsZero: false, override }) : null,
    },
    warnings,
  };
}
