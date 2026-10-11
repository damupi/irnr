import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { attachments } from "@/db/schema";
import { findCategory, seedCategories } from "./categories";
import {
  createTransaction,
  deleteTransaction,
  duplicateTransaction,
  generateRecurring,
  getTransaction,
  listTransactions,
  toTaxTransactions,
  updateTransaction,
} from "./transactions";

function setup() {
  const db = createTestDb();
  seedCategories(db);
  const cat = (a: string, b: string) => findCategory(db, a, b)!.id;
  return { db, cat };
}
const base = { date: "2024-03-01", kind: "expense" as const, amountCents: 23_501, concept: "Seguro hogar" };

describe("createTransaction", () => {
  it("crea con defaults", () => {
    const { db } = setup();
    const t = createTransaction(db, base);
    expect(t).toMatchObject({ ...base, allocationPct: 100, frequency: "unica", hasInvoice: false, categoryId: null, source: "manual" });
  });
  it.each([
    ["importe 0", { amountCents: 0 }],
    ["importe negativo", { amountCents: -5 }],
    ["importe decimal", { amountCents: 10.5 }],
    ["fecha mala", { date: "01/03/2024" }],
    ["fecha imposible", { date: "2024-02-31" }],
    ["sin concepto", { concept: "  " }],
    ["afectación > 100", { allocationPct: 101 }],
    ["tipo inválido", { kind: "otro" }],
  ])("rechaza %s", (_n, over) => {
    const { db } = setup();
    expect(() => createTransaction(db, { ...base, ...over } as never)).toThrow();
  });
});

describe("update / delete / duplicate", () => {
  it("updateTransaction cambia campos y updated_at", () => {
    const { db, cat } = setup();
    const t = createTransaction(db, base);
    const u = updateTransaction(db, t.id, { amountCents: 30_000, categoryId: cat("gastos", "seguros") });
    expect(u).toMatchObject({ amountCents: 30_000, concept: "Seguro hogar" });
    expect(u.categoryId).toBe(cat("gastos", "seguros"));
    expect(() => updateTransaction(db, 999, { amountCents: 1 })).toThrow(/no existe/);
    expect(() => updateTransaction(db, t.id, { amountCents: 0 })).toThrow();
  });

  it("deleteTransaction borra los ficheros de adjuntos", () => {
    const { db } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "irnr-"));
    const t = createTransaction(db, base);
    fs.mkdirSync(path.join(dir, "attachments/2024"), { recursive: true });
    const file = path.join(dir, "attachments/2024/u-a.pdf");
    fs.writeFileSync(file, "x");
    db.insert(attachments).values({ transactionId: t.id, filename: "a.pdf", path: "2024/u-a.pdf", mime: "application/pdf", size: 1, sha256: "x" }).run();
    deleteTransaction(db, t.id, dir);
    expect(fs.existsSync(file)).toBe(false);
    expect(getTransaction(db, t.id)).toBeNull();
  });

  it("deleteTransaction tolera ficheros ausentes", () => {
    const { db } = setup();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "irnr-"));
    const t = createTransaction(db, base);
    db.insert(attachments).values({ transactionId: t.id, filename: "a.pdf", path: "2024/no.pdf", mime: "application/pdf", size: 1, sha256: "x" }).run();
    expect(() => deleteTransaction(db, t.id, dir)).not.toThrow();
  });

  it("duplicateTransaction usa la fecha de hoy y no copia external_key", () => {
    const { db } = setup();
    const t = createTransaction(db, { ...base, externalKey: "k" } as never);
    const d = duplicateTransaction(db, t.id, "2026-10-10");
    expect(d.date).toBe("2026-10-10");
    expect(d.id).not.toBe(t.id);
    expect(d.externalKey).toBeNull();
    expect(d.concept).toBe(t.concept);
    expect(() => duplicateTransaction(db, 999, "2026-10-10")).toThrow(/no existe/);
  });
});

describe("generateRecurring", () => {
  it("mensual × 3", () => {
    const { db } = setup();
    const t = createTransaction(db, { ...base, date: "2024-01-31" });
    const rows = generateRecurring(db, t.id, { every: "month", count: 3 });
    expect(rows.map((r) => r.date)).toEqual(["2024-02-29", "2024-03-31", "2024-04-30"]);
    expect(rows.every((r) => r.frequency === "mensual")).toBe(true);
  });
  it("trimestral y anual", () => {
    const { db } = setup();
    const t = createTransaction(db, { ...base, date: "2024-03-15" });
    expect(generateRecurring(db, t.id, { every: "quarter", count: 2 }).map((r) => r.date)).toEqual(["2024-06-15", "2024-09-15"]);
    expect(generateRecurring(db, t.id, { every: "year", count: 1 }).map((r) => r.date)).toEqual(["2025-03-15"]);
  });
  it("valida count y existencia", () => {
    const { db } = setup();
    const t = createTransaction(db, base);
    expect(() => generateRecurring(db, t.id, { every: "month", count: 0 })).toThrow();
    expect(() => generateRecurring(db, t.id, { every: "month", count: 121 })).toThrow();
    expect(() => generateRecurring(db, 999, { every: "month", count: 1 })).toThrow(/no existe/);
  });
});

describe("listTransactions", () => {
  function seed() {
    const s = setup();
    const { db, cat } = s;
    createTransaction(db, { ...base, categoryId: cat("gastos", "seguros"), hasInvoice: true, date: "2024-03-01" });
    createTransaction(db, { ...base, concept: "Comunidad T1", payee: "Admin Fincas", amountCents: 12_000, categoryId: cat("gastos", "comunidad"), date: "2025-01-10" });
    createTransaction(db, { ...base, concept: "Pintura", amountCents: 40_000, date: "2025-05-01" });
    createTransaction(db, { date: "2025-02-01", kind: "income", amountCents: 78_000, concept: "Alquiler feb", categoryId: cat("ingresos", "alquiler") });
    createTransaction(db, { ...base, concept: "Mueve a 2024", date: "2025-01-02", taxYearOverride: 2024 });
    return s;
  }

  it("filtra por ejercicio efectivo (con override)", () => {
    const { db } = seed();
    expect(listTransactions(db, { year: 2025 }).rows).toHaveLength(3);
    expect(listTransactions(db, { year: 2024 }).rows.map((r) => r.concept).sort()).toEqual(["Mueve a 2024", "Seguro hogar"]);
  });
  it("tipo, cat1, cat2", () => {
    const { db } = seed();
    expect(listTransactions(db, { kind: "income" }).rows).toHaveLength(1);
    expect(listTransactions(db, { cat1: "gastos" }).rows).toHaveLength(2);
    expect(listTransactions(db, { cat1: "gastos", cat2: "comunidad" }).rows).toHaveLength(1);
  });
  it("sin categoría, sin adjunto, sin factura", () => {
    const { db } = seed();
    expect(listTransactions(db, { uncategorized: true }).rows).toHaveLength(2);
    expect(listTransactions(db, { noAttachment: true }).rows).toHaveLength(5);
    expect(listTransactions(db, { noInvoice: true }).rows.every((r) => !r.hasInvoice && r.kind === "expense")).toBe(true);
    expect(listTransactions(db, { noInvoice: true }).rows).toHaveLength(3);
  });
  it("adjuntos: noAttachment excluye los que tienen, y cuenta", () => {
    const { db } = seed();
    const id = listTransactions(db, { q: "Pintura" }).rows[0].id;
    db.insert(attachments).values({ transactionId: id, filename: "a", path: "p", mime: "m", size: 1, sha256: "s" }).run();
    expect(listTransactions(db, { noAttachment: true }).rows).toHaveLength(4);
    expect(listTransactions(db, { q: "Pintura" }).rows[0].attachmentCount).toBe(1);
  });
  it("texto libre en concepto/beneficiario/notas", () => {
    const { db } = seed();
    expect(listTransactions(db, { q: "fincas" }).rows).toHaveLength(1);
    expect(listTransactions(db, { q: "PINTURA" }).rows).toHaveLength(1);
  });
  it("orden por fecha/importe y totales", () => {
    const { db } = seed();
    const byDateAsc = listTransactions(db, { year: 2025, sort: "date", dir: "asc" }).rows.map((r) => r.date);
    expect(byDateAsc).toEqual([...byDateAsc].sort());
    expect(listTransactions(db, { sort: "amount", dir: "desc" }).rows[0].amountCents).toBe(78_000);
    expect(listTransactions(db, { sort: "amount", dir: "asc" }).rows[0].amountCents).toBe(12_000);
    const t = listTransactions(db, { year: 2025 }).totals;
    expect(t).toEqual({ incomeCents: 78_000, expenseCents: 12_000 + 40_000, count: 3 });
  });
  it("incluye la categoría", () => {
    const { db } = seed();
    expect(listTransactions(db, { q: "Comunidad" }).rows[0].category).toMatchObject({ cat1: "gastos", cat2: "comunidad" });
    expect(listTransactions(db, { q: "Pintura" }).rows[0].category).toBeNull();
  });
});

describe("toTaxTransactions", () => {
  it("convierte filas con su categoría", () => {
    const { db, cat } = setup();
    createTransaction(db, { ...base, categoryId: cat("gastos", "seguros"), allocationPct: 50, taxYearOverride: 2025 });
    createTransaction(db, { ...base, concept: "sin cat" });
    const rows = listTransactions(db, {}).rows;
    const tax = toTaxTransactions(rows);
    const seg = tax.find((t) => t.treatment === "deductible")!;
    expect(seg).toMatchObject({ box: 10, prorate: true, allocationPct: 50, taxYearOverride: 2025, kind: "expense", amountCents: 23_501 });
    expect(tax.find((t) => t.treatment === null)).toMatchObject({ box: null, prorate: false });
  });
});
