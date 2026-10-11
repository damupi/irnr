import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-utils";
import { attachments, categories, transactions } from "./schema";

const txRow = (over: Partial<typeof transactions.$inferInsert> = {}): typeof transactions.$inferInsert => ({
  date: "2024-03-01",
  kind: "expense",
  amountCents: 23_501,
  concept: "Seguro hogar",
  ...over,
});

describe("schema", () => {
  it("borrar un movimiento borra sus adjuntos (cascade)", () => {
    const db = createTestDb();
    const [cat] = db.insert(categories).values({ cat1: "gastos", cat2: "seguros", treatment: "deductible", box: 10, prorate: true }).returning().all();
    const [tx] = db.insert(transactions).values(txRow({ categoryId: cat.id })).returning().all();
    db.insert(attachments).values({ transactionId: tx.id, filename: "a.pdf", path: "2024/x-a.pdf", mime: "application/pdf", size: 1, sha256: "x" }).run();
    expect(db.select().from(attachments).all()).toHaveLength(1);
    db.delete(transactions).where(eq(transactions.id, tx.id)).run();
    expect(db.select().from(attachments).all()).toHaveLength(0);
  });

  it("external_key duplicada falla", () => {
    const db = createTestDb();
    db.insert(transactions).values(txRow({ externalKey: "k1" })).run();
    expect(() => db.insert(transactions).values(txRow({ externalKey: "k1" })).run()).toThrow();
  });

  it("external_key null puede repetirse", () => {
    const db = createTestDb();
    db.insert(transactions).values(txRow()).run();
    db.insert(transactions).values(txRow()).run();
    expect(db.select().from(transactions).all()).toHaveLength(2);
  });

  it("defaults del movimiento", () => {
    const db = createTestDb();
    const [t] = db.insert(transactions).values(txRow()).returning().all();
    expect(t).toMatchObject({ allocationPct: 100, frequency: "unica", hasInvoice: false, source: "manual", categoryId: null });
  });

  it("no permite importes <= 0", () => {
    const db = createTestDb();
    expect(() => db.insert(transactions).values(txRow({ amountCents: 0 })).run()).toThrow();
  });

  it("categoría única por cat1/cat2", () => {
    const db = createTestDb();
    const c = { cat1: "gastos", cat2: "seguros", treatment: "deductible" as const };
    db.insert(categories).values(c).run();
    expect(() => db.insert(categories).values(c).run()).toThrow();
  });
});
