import { daysInYear } from "@/lib/dates";
import { daysRented } from "./days";
import type { RentalPeriod } from "./types";

const BUILDING_RATE = 0.03;

export interface BuildingAmortization {
  amortizationCents: number;
  /** max(Σ costes de adquisición, VC total) */
  baseCents: number;
  acquisitionTotalCents: number;
  cadastralTotalCents: number;
  /** VC construcción / VC total */
  buildingShare: number;
}

export function buildingAmortization(input: {
  acquisitionCostsCents: number[];
  landCents: number;
  buildingCents: number;
  rentRatio: number;
}): BuildingAmortization {
  const acquisitionTotalCents = input.acquisitionCostsCents.reduce((a, b) => a + b, 0);
  const cadastralTotalCents = input.landCents + input.buildingCents;
  const baseCents = Math.max(acquisitionTotalCents, cadastralTotalCents);
  const buildingShare = cadastralTotalCents === 0 ? 0 : input.buildingCents / cadastralTotalCents;
  return {
    amortizationCents: Math.round(baseCents * buildingShare * BUILDING_RATE * input.rentRatio),
    baseCents,
    acquisitionTotalCents,
    cadastralTotalCents,
    buildingShare,
  };
}

export interface AssetItem {
  id: number;
  costCents: number;
  date: string;
}

export interface AssetAmortizationItem {
  id: number;
  costCents: number;
  date: string;
  daysRented: number;
  priorDeductedCents: number;
  /** cuota del año sin redondear, ya limitada al pendiente */
  rawCents: number;
}

export function assetAmortization(input: {
  items: AssetItem[];
  pct: number;
  year: number;
  periods: RentalPeriod[];
  acq: string;
  priorDeductedById: Record<number, number>;
}): { totalCents: number; items: AssetAmortizationItem[] } {
  const items = input.items.map((item): AssetAmortizationItem => {
    const since = item.date > input.acq ? item.date : input.acq;
    const days = daysRented(input.periods, since, input.year);
    const prior = input.priorDeductedById[item.id] ?? 0;
    const quota = (item.costCents * input.pct * days) / (100 * daysInYear(input.year));
    const rawCents = Math.max(0, Math.min(quota, item.costCents - prior));
    return { ...item, daysRented: days, priorDeductedCents: prior, rawCents };
  });
  return { totalCents: Math.round(items.reduce((a, i) => a + i.rawCents, 0)), items };
}
