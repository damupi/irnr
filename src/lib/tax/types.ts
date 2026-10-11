export type Treatment =
  | "income"
  | "non_taxable_income"
  | "capped_1_4"
  | "deductible"
  | "acquisition_cost"
  | "furniture_10"
  | "improvement_3"
  | "non_deductible";

export interface TaxTransaction {
  id: number;
  date: string;
  kind: "income" | "expense";
  amountCents: number;
  treatment: Treatment | null;
  box: number | null;
  prorate: boolean;
  allocationPct: number;
  taxYearOverride: number | null;
}

export interface RentalPeriod {
  start: string;
  end: string | null;
}

export interface YearParams {
  year: number;
  cadastralLandCents: number;
  cadastralBuildingCents: number;
  imputationRatePct: number;
  initialCarryforwardCents: number;
  daysImputedOverride: number | null;
  deadlineOverride?: { from: string; to: string } | null;
}

export interface PropertyInput {
  acquisitionDate: string;
  ownershipPct: number;
  taxRatePct: number;
}

export interface Filing {
  year: number;
  incomeType: "01" | "02";
  filedAt: string;
  grossCents: number;
  expensesCents: number;
  baseCents: number;
  taxCents: number;
}

export interface PendingExcess {
  originYear: number;
  cents: number;
}

export interface Deadline {
  from: string;
  to: string;
}
