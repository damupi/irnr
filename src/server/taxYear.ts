import type { Db } from "@/db/client";
import { computeTaxYear, type TaxYearResult } from "@/lib/tax/modelo210";
import { filingStatus, type FilingStatusResult } from "@/lib/tax/deadlines";
import type { Filing, PendingExcess } from "@/lib/tax/types";
import { getFiling } from "./filings";
import { getYearParams, mustGetProperty } from "./properties";
import { listRentalPeriods } from "./rentals";
import { listTransactions, toTaxTransactions } from "./transactions";

export interface TaxYearView {
  year: number;
  result: TaxYearResult;
  filings: { rendimientos: Filing | null; imputada: Filing | null };
  status: { rendimientos: FilingStatusResult | null; imputada: FilingStatusResult | null };
}

/**
 * Calcula el ejercicio encadenando desde el año de adquisición: el arrastre de casillas 1–4 y lo ya
 * amortizado de muebles/mejoras dependen de los ejercicios anteriores.
 */
export function getTaxYear(db: Db, year: number, today: string): TaxYearView {
  const property = mustGetProperty(db);
  const periods = listRentalPeriods(db).map((r) => ({ start: r.startDate, end: r.endDate }));
  const transactions = toTaxTransactions(listTransactions(db).rows);
  const first = Number(property.acquisitionDate.slice(0, 4));

  let pending: PendingExcess[] = [];
  let seededInitial = false;
  const prior: Record<number, number> = {};
  let result: TaxYearResult | null = null;

  for (let y = first; y <= year; y++) {
    const params = getYearParams(db, y);
    if (!params) {
      if (y === year) throw new Error(`Faltan los parámetros del ejercicio ${year}`);
      continue;
    }
    if (!seededInitial) {
      seededInitial = true;
      if (params.initialCarryforwardCents > 0) pending = [{ originYear: y - 1, cents: params.initialCarryforwardCents }];
    }
    result = computeTaxYear({
      property: { acquisitionDate: property.acquisitionDate, ownershipPct: property.ownershipPct, taxRatePct: property.taxRatePct },
      params,
      periods,
      transactions,
      pendingCarryforward: pending,
      priorAssetDeductions: { ...prior },
      year: y,
      today,
    });
    pending = result.carryforward.pending;
    for (const item of [...result.amortization.furniture, ...result.amortization.improvements]) {
      prior[item.id] = (prior[item.id] ?? 0) + item.rawCents;
    }
  }

  if (!result) throw new Error(`Faltan los parámetros del ejercicio ${year}`);
  const final: TaxYearResult = result;
  const filings = { rendimientos: getFiling(db, year, "01"), imputada: getFiling(db, year, "02") };
  const statusOf = (deadline: TaxYearResult["deadlines"]["imputada"], filing: Filing | null) =>
    deadline ? filingStatus({ deadline, filing, today }) : null;
  return {
    year,
    result: final,
    filings,
    status: {
      rendimientos: statusOf(final.deadlines.rendimientos, filings.rendimientos),
      imputada: statusOf(final.deadlines.imputada, filings.imputada),
    },
  };
}
