import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import fs from "node:fs";
import { z } from "zod";
import type { Db } from "@/db/client";
import { attachments, categories, transactions, type Category, type Transaction } from "@/db/schema";
import { addMonths } from "@/lib/dates";
import type { TaxTransaction } from "@/lib/tax/types";
import { attachmentFilePath } from "./attachments";
import { isoDate } from "./validation";

const FREQUENCIES = ["unica", "mensual", "trimestral", "anual"] as const;

export const transactionInputSchema = z.object({
  date: isoDate,
  kind: z.enum(["expense", "income"]),
  amountCents: z.number().int().positive(),
  payee: z.string().nullish(),
  concept: z.string().trim().min(1),
  categoryId: z.number().int().nullish(),
  hasInvoice: z.boolean().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  allocationPct: z.number().gt(0).max(100).optional(),
  taxYearOverride: z.number().int().nullish(),
  notes: z.string().nullish(),
  source: z.enum(["manual", "import", "contract"]).optional(),
  externalKey: z.string().nullish(),
});
export type TransactionInput = z.input<typeof transactionInputSchema>;

export type TransactionRow = Transaction & { category: Category | null; attachmentCount: number };

export interface TransactionFilters {
  year?: number;
  kind?: "expense" | "income";
  cat1?: string;
  cat2?: string;
  uncategorized?: boolean;
  noAttachment?: boolean;
  noInvoice?: boolean;
  q?: string;
  sort?: "date" | "amount";
  dir?: "asc" | "desc";
}

export function getTransaction(db: Db, id: number): Transaction | null {
  return db.select().from(transactions).where(eq(transactions.id, id)).get() ?? null;
}

function mustGet(db: Db, id: number): Transaction {
  const t = getTransaction(db, id);
  if (!t) throw new Error(`El movimiento ${id} no existe`);
  return t;
}

export function createTransaction(db: Db, input: TransactionInput): Transaction {
  return db.insert(transactions).values(transactionInputSchema.parse(input)).returning().get();
}

export function updateTransaction(db: Db, id: number, input: Partial<TransactionInput>): Transaction {
  mustGet(db, id);
  const data = transactionInputSchema.partial().parse(input);
  return db
    .update(transactions)
    .set({ ...data, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` })
    .where(eq(transactions.id, id))
    .returning()
    .get();
}

export function deleteTransaction(db: Db, id: number, baseDir: string): void {
  const files = db.select().from(attachments).where(eq(attachments.transactionId, id)).all();
  for (const f of files) fs.rmSync(attachmentFilePath(baseDir, f.path), { force: true });
  db.delete(transactions).where(eq(transactions.id, id)).run();
}

function copyOf(t: Transaction): TransactionInput {
  return {
    date: t.date,
    kind: t.kind,
    amountCents: t.amountCents,
    payee: t.payee,
    concept: t.concept,
    categoryId: t.categoryId,
    hasInvoice: t.hasInvoice,
    frequency: t.frequency,
    allocationPct: t.allocationPct,
    taxYearOverride: t.taxYearOverride,
    notes: t.notes,
  };
}

export function duplicateTransaction(db: Db, id: number, today: string): Transaction {
  return createTransaction(db, { ...copyOf(mustGet(db, id)), date: today, taxYearOverride: null });
}

const STEP = { month: 1, quarter: 3, year: 12 } as const;
const FREQ = { month: "mensual", quarter: "trimestral", year: "anual" } as const;

export function generateRecurring(
  db: Db,
  id: number,
  opts: { every: "month" | "quarter" | "year"; count: number },
): Transaction[] {
  const count = z.number().int().min(1).max(120).parse(opts.count);
  const t = mustGet(db, id);
  return Array.from({ length: count }, (_, i) =>
    createTransaction(db, {
      ...copyOf(t),
      date: addMonths(t.date, STEP[opts.every] * (i + 1)),
      frequency: FREQ[opts.every],
      taxYearOverride: null,
    }),
  );
}

export const effectiveYear = sql<number>`coalesce(${transactions.taxYearOverride}, cast(substr(${transactions.date}, 1, 4) as integer))`;

export function listTransactions(
  db: Db,
  f: TransactionFilters = {},
): { rows: TransactionRow[]; totals: { incomeCents: number; expenseCents: number; count: number } } {
  const where: SQL[] = [];
  if (f.year !== undefined) where.push(sql`${effectiveYear} = ${f.year}`);
  if (f.kind) where.push(eq(transactions.kind, f.kind));
  if (f.cat1) where.push(eq(categories.cat1, f.cat1));
  if (f.cat2) where.push(eq(categories.cat2, f.cat2));
  if (f.uncategorized) where.push(sql`${transactions.categoryId} is null`);
  if (f.noAttachment) where.push(sql`not exists (select 1 from attachments a where a.transaction_id = ${transactions.id})`);
  if (f.noInvoice) where.push(and(eq(transactions.kind, "expense"), eq(transactions.hasInvoice, false))!);
  if (f.q) {
    const pat = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    const cols = [transactions.concept, transactions.payee, transactions.notes];
    where.push(or(...cols.map((c) => sql`${c} like ${pat} escape '\\'`))!);
  }
  const dir = f.dir === "asc" ? asc : desc;
  const order = f.sort === "amount" ? [dir(transactions.amountCents), desc(transactions.id)] : [dir(transactions.date), desc(transactions.id)];

  const found = db
    .select({ tx: transactions, category: categories })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...where))
    .orderBy(...order)
    .all();

  const counts = new Map(
    db
      .select({ id: attachments.transactionId, n: sql<number>`count(*)` })
      .from(attachments)
      .where(sql`${attachments.transactionId} is not null`)
      .groupBy(attachments.transactionId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const rows = found.map((r) => ({ ...r.tx, category: r.category, attachmentCount: counts.get(r.tx.id) ?? 0 }));
  const sum = (kind: string) => rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.amountCents, 0);
  return { rows, totals: { incomeCents: sum("income"), expenseCents: sum("expense"), count: rows.length } };
}

export function toTaxTransactions(rows: TransactionRow[]): TaxTransaction[] {
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    kind: r.kind,
    amountCents: r.amountCents,
    treatment: r.category?.treatment ?? null,
    box: r.category?.box ?? null,
    prorate: r.category?.prorate ?? false,
    allocationPct: r.allocationPct,
    taxYearOverride: r.taxYearOverride,
  }));
}

