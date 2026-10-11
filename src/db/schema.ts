import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Treatment } from "@/lib/tax/types";

const now = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  alias: text("alias").notNull(),
  address: text("address"),
  cadastralRef: text("cadastral_ref"),
  acquisitionDate: text("acquisition_date").notNull(),
  ownershipPct: real("ownership_pct").notNull().default(100),
  residenceCountry: text("residence_country").notNull().default("DE"),
  taxRatePct: real("tax_rate_pct").notNull().default(19),
});

export const propertyYearParams = sqliteTable(
  "property_year_params",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    cadastralLandCents: integer("cadastral_land_cents").notNull(),
    cadastralBuildingCents: integer("cadastral_building_cents").notNull(),
    imputationRatePct: real("imputation_rate_pct").notNull().default(2),
    initialCarryforwardCents: integer("initial_carryforward_cents").notNull().default(0),
    deadlineOverrideFrom: text("deadline_override_from"),
    deadlineOverrideTo: text("deadline_override_to"),
    daysImputedOverride: integer("days_imputed_override"),
  },
  (t) => [uniqueIndex("property_year_unique").on(t.propertyId, t.year)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cat1: text("cat1").notNull(),
    cat2: text("cat2").notNull(),
    treatment: text("treatment").$type<Treatment>().notNull(),
    box: integer("box"),
    prorate: integer("prorate", { mode: "boolean" }).notNull().default(false),
    help: text("help"),
  },
  (t) => [uniqueIndex("categories_cat1_cat2").on(t.cat1, t.cat2)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    kind: text("kind").$type<"expense" | "income">().notNull(),
    amountCents: integer("amount_cents").notNull(),
    payee: text("payee"),
    concept: text("concept").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    hasInvoice: integer("has_invoice", { mode: "boolean" }).notNull().default(false),
    frequency: text("frequency").$type<"unica" | "mensual" | "trimestral" | "anual">().notNull().default("unica"),
    allocationPct: real("allocation_pct").notNull().default(100),
    taxYearOverride: integer("tax_year_override"),
    notes: text("notes"),
    source: text("source").$type<"manual" | "import" | "contract">().notNull().default("manual"),
    externalKey: text("external_key"),
    createdAt: text("created_at").notNull().default(now()),
    updatedAt: text("updated_at").notNull().default(now()),
  },
  (t) => [
    index("transactions_date").on(t.date),
    uniqueIndex("transactions_external_key").on(t.externalKey),
    check("transactions_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const rentalPeriods = sqliteTable("rental_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  tenant: text("tenant"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  monthlyRentCents: integer("monthly_rent_cents").notNull(),
  agency: text("agency"),
  notes: text("notes"),
});

export const filings = sqliteTable("filings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(),
  incomeType: text("income_type").$type<"01" | "02">().notNull(),
  filedAt: text("filed_at").notNull(),
  receiptNumber: text("receipt_number"),
  grossCents: integer("gross_cents").notNull().default(0),
  expensesCents: integer("expenses_cents").notNull().default(0),
  baseCents: integer("base_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  notes: text("notes"),
});

export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    rentalPeriodId: integer("rental_period_id").references(() => rentalPeriods.id, { onDelete: "cascade" }),
    filingId: integer("filing_id").references(() => filings.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    path: text("path").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull().default(now()),
  },
  (t) => [
    index("attachments_transaction").on(t.transactionId),
    check(
      "attachments_one_owner",
      sql`(${t.transactionId} IS NOT NULL) + (${t.rentalPeriodId} IS NOT NULL) + (${t.filingId} IS NOT NULL) = 1`,
    ),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type RentalPeriodRow = typeof rentalPeriods.$inferSelect;
export type FilingRow = typeof filings.$inferSelect;
export type YearParamsRow = typeof propertyYearParams.$inferSelect;
