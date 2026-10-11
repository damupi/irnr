import type { PropertyInput, RentalPeriod, TaxTransaction, Treatment, YearParams } from "../types";

export const property: PropertyInput = { acquisitionDate: "2023-10-02", ownershipPct: 100, taxRatePct: 19 };

export const periods: RentalPeriod[] = [
  { start: "2024-02-01", end: "2026-01-31" },
  { start: "2026-02-01", end: "2027-01-31" },
];

export const params = (year: number, over: Partial<YearParams> = {}): YearParams => ({
  year,
  cadastralLandCents: 863_269,
  cadastralBuildingCents: 1_688_699,
  imputationRatePct: 2,
  initialCarryforwardCents: 0,
  daysImputedOverride: null,
  ...over,
});

export function tx(
  id: number,
  date: string,
  amountCents: number,
  treatment: Treatment | null,
  opts: Partial<Pick<TaxTransaction, "box" | "prorate" | "allocationPct" | "taxYearOverride" | "kind">> = {},
): TaxTransaction {
  return {
    id,
    date,
    kind: treatment === "income" || treatment === "non_taxable_income" ? "income" : "expense",
    amountCents,
    treatment,
    box: null,
    prorate: false,
    allocationPct: 100,
    taxYearOverride: null,
    ...opts,
  };
}

const month = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

export const acquisitionCosts: TaxTransaction[] = [
  [70, 20_000_000],
  [71, 1_200_000],
  [72, 270_000],
  [73, 37_033],
  [74, 35_547],
  [75, 48_400],
  [76, 13_310],
].map(([id, amount]) => tx(id, "2023-10-02", amount, "acquisition_cost"));
// Σ = 21.604.290

export const furniture: TaxTransaction[] = [30_000, 25_000, 22_000, 20_726, 10_000].map((a, i) =>
  tx(60 + i, "2023-10-15", a, "furniture_10", { box: 13 }),
);
// Σ = 107.726

export const income2024: TaxTransaction[] = Array.from({ length: 11 }, (_, i) => tx(1 + i, month(2024, i + 2), 78_000, "income"));

export const interest2024: TaxTransaction[] = Array.from({ length: 12 }, (_, i) =>
  tx(20 + i, month(2024, i + 1), i === 11 ? 32_673 : 32_700, "capped_1_4", { prorate: true }),
);
// Σ = 392.373

export const repairs2024: TaxTransaction[] = [
  tx(40, "2024-05-10", 25_000, "capped_1_4"),
  tx(41, "2024-06-10", 15_000, "capped_1_4"),
];

export const expenses2024: TaxTransaction[] = [
  tx(50, "2024-03-01", 23_501, "deductible", { box: 10, prorate: true }),
  tx(51, "2024-03-31", 12_000, "deductible", { box: 5, prorate: true }),
  tx(52, "2024-04-30", 14_466, "deductible", { box: 11, prorate: true }),
  tx(53, "2024-01-15", 78_000, "deductible", { box: 6 }),
];

export const ignored2024: TaxTransaction[] = [
  tx(12, "2024-02-01", 78_000, "non_taxable_income"),
  tx(80, "2024-05-20", 1_000_000, "non_deductible"),
];

export const transactions2024: TaxTransaction[] = [
  ...income2024,
  ...interest2024,
  ...repairs2024,
  ...expenses2024,
  ...ignored2024,
  ...furniture,
  ...acquisitionCosts,
];

export const interest2025: TaxTransaction[] = Array.from({ length: 12 }, (_, i) =>
  tx(200 + i, month(2025, i + 1), i === 11 ? 27_183 : 26_900, "capped_1_4", { prorate: true }),
);
// Σ = 11×26.900 + 27.183 = 323.083

export const income2025: TaxTransaction[] = Array.from({ length: 12 }, (_, i) => tx(300 + i, month(2025, i + 1), 78_000, "income"));

export const repairs2023: TaxTransaction[] = [
  tx(90, "2023-10-20", 135_938, "capped_1_4"),
  tx(91, "2023-10-25", 18_520, "capped_1_4"),
];
