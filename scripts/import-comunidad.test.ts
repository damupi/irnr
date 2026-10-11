import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachments } from "@/db/schema";
import { createTestDb } from "@/db/test-utils";
import { LIQ_3T_2024, LIQ_4T_2025 } from "@/lib/__fixtures__/liquidacion";
import { seedCategories, findCategory } from "@/server/categories";
import { createTransaction, listTransactions } from "@/server/transactions";
import { importLiquidaciones } from "./import-comunidad";

const pdf = (name: string, text: string) => ({ fileName: name, text, bytes: Buffer.from(`%PDF ${name}`) });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "irnr-com-"));

function setup() {
  const db = createTestDb();
  seedCategories(db);
  const cat = (b: string) => findCategory(db, "gastos", b)!.id;
  const row = (date: string, amountCents: number, concept: string, c: "comunidad" | "reparacion y conservacion") =>
    createTransaction(db, { date, kind: "expense", amountCents, concept, payee: "comunidad propietarios", categoryId: cat(c), source: "import" });
  return { db, row };
}
const comRows = (db: ReturnType<typeof createTestDb>) => listTransactions(db, { sort: "date", dir: "asc" }).rows;

describe("importLiquidaciones", () => {
  it("reparte una cuota única en ordinaria + reparación y crea la fila de reparación", () => {
    const { db, row } = setup();
    row("2024-10-09", 6702, "PAGO 3ER TRIMESTRE", "comunidad");
    const rep = importLiquidaciones(db, [pdf("3t24.pdf", LIQ_3T_2024)], tmp());
    const rows = comRows(db);
    expect(rows).toHaveLength(3);
    const ord = rows.find((r) => r.category?.cat2 === "comunidad")!;
    const rp = rows.find((r) => r.category?.cat2 === "reparacion y conservacion")!;
    const fondo = rows.find((r) => r.category?.cat2 === "fondo de reserva comunidad")!;
    expect(ord.amountCents).toBe(6702 - 2165 - 1223);
    expect(rp.amountCents).toBe(2165);
    expect(fondo.amountCents).toBe(1223);
    expect(fondo.category?.treatment).toBe("non_deductible"); // el fondo de reserva no se deduce
    expect(fondo.externalKey).toBe("liquidacion:2024-3:fondo");
    expect(fondo.frequency).toBe("unica");
    expect(ord.date).toBe("2024-10-09");
    expect(rp.date).toBe("2024-10-09");
    expect(ord.amountCents + rp.amountCents + fondo.amountCents).toBe(6702);
    expect(ord.hasInvoice && rp.hasInvoice).toBe(true);
    expect(ord.frequency).toBe("trimestral");
    expect(rp.frequency).toBe("unica"); // las obras no son recurrentes: no deben generar alertas de «recurrentes que faltan»
    expect(ord.externalKey).toBe("liquidacion:2024-3:ordinaria");
    expect(rp.externalKey).toBe("liquidacion:2024-3:reparacion");
    expect(rp.notes).toContain("REPARACION RODAPIE");
    expect(ord.notes).toMatch(/fondo de reserva/i);
    expect(fondo.notes).toMatch(/no deducible/i);
    expect(rep[0]).toMatchObject({ year: 2024, quarter: 3, totalCents: 6702, ordinaryCents: 3314, repairCents: 2165, reserveFundCents: 1223, matched: "exacto" });
  });

  it("casa por suma exacta entre varias filas cercanas y actualiza ambas", () => {
    const { db, row } = setup();
    row("2025-07-05", 12178, "PAGO 2DO TRIMESTRE", "comunidad"); // otro trimestre cercano: no debe tocarse
    row("2026-01-06", 3000, "PAGO 4o TRIMESTRE 2025", "reparacion y conservacion");
    row("2026-01-06", 3355, "PAGO 4o TRIMESTRE 2025", "comunidad");
    importLiquidaciones(db, [pdf("4t25.pdf", LIQ_4T_2025)], tmp());
    const rows = comRows(db);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.date === "2025-07-05")!.amountCents).toBe(12178);
    const rp = rows.find((r) => r.date === "2026-01-06" && r.category?.cat2 === "reparacion y conservacion")!;
    expect(rp.amountCents).toBe(3262 + 349 + 716 - 1328);
    expect(rows.find((r) => r.date === "2026-01-06" && r.category?.cat2 === "fondo de reserva comunidad")!.amountCents).toBe(1081);
    expect(rows.find((r) => r.date === "2026-01-06" && r.category?.cat2 === "comunidad")!.amountCents).toBe(6355 - rp.amountCents - 1081);
  });

  it("si el total de la hoja no coincide, casa por la fecha de pago y corrige el importe", () => {
    const { db, row } = setup();
    row("2026-01-08", 7000, "PAGO", "comunidad"); // typo en la hoja: debería sumar 6355
    const rep = importLiquidaciones(db, [pdf("4t25.pdf", LIQ_4T_2025)], tmp());
    expect(rep[0].matched).toBe("fecha");
    expect(comRows(db).reduce((a, r) => a + r.amountCents, 0)).toBe(6355);
  });

  it("sin apuntes previos crea ambas filas con la fecha indicada", () => {
    const { db } = setup();
    const rep = importLiquidaciones(db, [pdf("4t25.pdf", LIQ_4T_2025)], tmp(), { dateOverrides: { "2025-4": "2026-01-07" } });
    expect(rep[0].matched).toBe("nuevo");
    const rows = comRows(db);
    expect(rows.map((r) => r.date)).toEqual(["2026-01-07", "2026-01-07", "2026-01-07"]);
    expect(rows[0].payee).toBe("Comunidad de propietarios");
    expect(rows.reduce((a, r) => a + r.amountCents, 0)).toBe(6355);
  });

  it("sin apuntes ni fecha → usa el fin de trimestre", () => {
    const { db } = setup();
    importLiquidaciones(db, [pdf("4t25.pdf", LIQ_4T_2025)], tmp());
    expect(comRows(db)[0].date).toBe("2025-12-31");
  });

  it("es idempotente y no duplica adjuntos", () => {
    const { db, row } = setup();
    row("2024-10-09", 6702, "PAGO 3ER TRIMESTRE", "comunidad");
    const dir = tmp();
    importLiquidaciones(db, [pdf("3t24.pdf", LIQ_3T_2024)], dir);
    const snapshot = JSON.stringify(comRows(db).map((r) => [r.id, r.amountCents, r.date, r.attachmentCount]));
    const rep2 = importLiquidaciones(db, [pdf("3t24.pdf", LIQ_3T_2024)], dir);
    expect(JSON.stringify(comRows(db).map((r) => [r.id, r.amountCents, r.date, r.attachmentCount]))).toBe(snapshot);
    expect(db.select().from(attachments).all()).toHaveLength(3); // una por movimiento
    expect(rep2[0].matched).toBe("clave");
  });

  it("fusiona varias filas de la misma categoría que pertenecen a la liquidación", () => {
    const { db, row } = setup();
    row("2024-10-09", 4537, "cuota", "comunidad");  // el fondo de reserva aún está dentro de la cuota
    row("2024-10-02", 1000, "reparación a", "reparacion y conservacion");
    row("2024-10-03", 1165, "reparación b", "reparacion y conservacion");
    const rep = importLiquidaciones(db, [pdf("3t24.pdf", LIQ_3T_2024)], tmp());
    const rows = comRows(db);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.category?.cat2 === "reparacion y conservacion")!.amountCents).toBe(2165);
    expect(rep[0].merged).toBe(1);
  });

  it("si algo falla no deja la importación a medias", () => {
    const { db, row } = setup();
    row("2024-10-09", 6702, "PAGO 3ER TRIMESTRE", "comunidad");
    const bad = LIQ_4T_2025.replace("4º TRIMESTRE 2025", "2º TRIMESTRE 2025");
    expect(() => importLiquidaciones(db, [pdf("3t24.pdf", LIQ_3T_2024), pdf("bad.pdf", bad.replace("TOTAL A PAGAR POR USTED EN EL 4º TRIMESTRE DEL 2025", "NADA"))], tmp())).toThrow(/total/);
    expect(comRows(db)).toHaveLength(1);
    expect(comRows(db)[0].amountCents).toBe(6702);
  });

  it("ignora ficheros duplicados (mismo trimestre)", () => {
    const { db } = setup();
    const rep = importLiquidaciones(db, [pdf("a.pdf", LIQ_4T_2025), pdf("a (1).pdf", LIQ_4T_2025)], tmp());
    expect(rep).toHaveLength(1);
    expect(comRows(db)).toHaveLength(3);
  });

  it("si las reparaciones netas no son positivas, todo va a la cuota ordinaria", () => {
    const { db } = setup();
    const text = LIQ_4T_2025.replace("FRAC.79 FONTANERIA SENI (50% CAMBIO DE MONTANTE DEL PRIMER PISO AL BAJO POR ROTURA DEL MISMO) 1.402,50 €     32,62 €", "FRAC.79 FONTANERIA SENI (CAMBIO DE MONTANTE) 100,00 €     1,00 €");
    importLiquidaciones(db, [pdf("neg.pdf", text)], tmp());
    const rows = comRows(db);
    expect(rows).toHaveLength(2);
    const ord = rows.find((r) => r.category?.cat2 === "comunidad")!;
    expect(ord.amountCents).toBe(6355 - 1081);
    expect(ord.notes).toMatch(/reparaciones netas/i);
    expect(rows.find((r) => r.category?.cat2 === "fondo de reserva comunidad")!.amountCents).toBe(1081);
  });
});
