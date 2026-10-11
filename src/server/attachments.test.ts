import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createTestDb } from "@/db/test-utils";
import { filings, rentalPeriods, properties } from "@/db/schema";
import { createTransaction } from "./transactions";
import { attachmentFilePath, contentDisposition, deleteAttachment, getAttachment, listAttachments, readAttachmentFile, sanitizeFilename, saveAttachment } from "./attachments";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "irnr-att-"));
const pdf = (name = "Factura seguro.pdf", bytes = Buffer.from("%PDF-1.4 test")) => ({ name, type: "application/pdf", bytes });
const tx = (db: ReturnType<typeof createTestDb>) => createTransaction(db, { date: "2024-03-01", kind: "expense", amountCents: 100, concept: "x" });

describe("sanitizeFilename", () => {
  it("quita rutas, espacios y caracteres raros", () => {
    expect(sanitizeFilename("../../etc/pass wd.pdf")).toBe("pass_wd.pdf");
    expect(sanitizeFilename("Recibo ñandú (1).PDF")).toBe("Recibo_nandu_1_.PDF");
    expect(sanitizeFilename("...")).toBe("file");
    expect(sanitizeFilename("a".repeat(300) + ".pdf").length).toBeLessThanOrEqual(100);
  });
});

describe("saveAttachment", () => {
  it("escribe en attachments/<año>/<uuid>-<nombre>, calcula sha256 y guarda fila", () => {
    const db = createTestDb();
    const dir = tmp();
    const t = tx(db);
    const a = saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: pdf() }, dir);
    expect(a.path).toMatch(/^2024\/[0-9a-f-]{36}-Factura_seguro\.pdf$/);
    expect(fs.readFileSync(path.join(dir, "attachments", a.path), "utf8")).toBe("%PDF-1.4 test");
    expect(a).toMatchObject({ filename: "Factura seguro.pdf", mime: "application/pdf", size: 13, transactionId: t.id });
    expect(a.sha256).toBe(createHash("sha256").update("%PDF-1.4 test").digest("hex"));
    expect(listAttachments(db, { ownerType: "transaction", ownerId: t.id })).toHaveLength(1);
  });

  it("rechaza > 20 MB y mimes fuera de lista, sin dejar fichero ni fila", () => {
    const db = createTestDb();
    const dir = tmp();
    const t = tx(db);
    const big = { name: "a.pdf", type: "application/pdf", bytes: Buffer.alloc(20 * 1024 * 1024 + 1) };
    expect(() => saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: big }, dir)).toThrow(/20 MB/);
    expect(() => saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: { name: "a.exe", type: "application/x-msdownload", bytes: Buffer.from("x") } }, dir)).toThrow(/tipo/i);
    expect(() => saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: { name: "a.pdf", type: "application/pdf", bytes: Buffer.alloc(0) } }, dir)).toThrow(/vacío/);
    expect(listAttachments(db, { ownerType: "transaction", ownerId: t.id })).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, "attachments"))).toBe(false);
  });

  it("acepta jpg, png y heic", () => {
    const db = createTestDb();
    const dir = tmp();
    const t = tx(db);
    for (const type of ["image/jpeg", "image/png", "image/heic"]) {
      saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: { name: "f", type, bytes: Buffer.from("x") } }, dir);
    }
    expect(listAttachments(db, { ownerType: "transaction", ownerId: t.id })).toHaveLength(3);
  });

  it("propietario inexistente → error", () => {
    const db = createTestDb();
    expect(() => saveAttachment(db, { ownerType: "transaction", ownerId: 99, file: pdf() }, tmp())).toThrow(/no existe/);
  });

  it("contrato y declaración como propietarios", () => {
    const db = createTestDb();
    const dir = tmp();
    const [p] = db.insert(properties).values({ alias: "V", acquisitionDate: "2023-10-02" }).returning().all();
    const [r] = db.insert(rentalPeriods).values({ propertyId: p.id, startDate: "2024-02-01", monthlyRentCents: 78_000 }).returning().all();
    const [f] = db.insert(filings).values({ year: 2024, incomeType: "01", filedAt: "2025-10-12" }).returning().all();
    const a1 = saveAttachment(db, { ownerType: "rentalPeriod", ownerId: r.id, file: pdf() }, dir);
    const a2 = saveAttachment(db, { ownerType: "filing", ownerId: f.id, file: pdf() }, dir);
    expect(a1.rentalPeriodId).toBe(r.id);
    expect(a1.path.startsWith("2024/")).toBe(true);
    expect(a2.filingId).toBe(f.id);
    expect(a2.path.startsWith("2024/")).toBe(true);
    expect(() => saveAttachment(db, { ownerType: "filing", ownerId: 99, file: pdf() }, dir)).toThrow(/no existe/);
    expect(() => saveAttachment(db, { ownerType: "rentalPeriod", ownerId: 99, file: pdf() }, dir)).toThrow(/no existe/);
  });
});

describe("get / delete / paths", () => {
  it("getAttachment y deleteAttachment", () => {
    const db = createTestDb();
    const dir = tmp();
    const a = saveAttachment(db, { ownerType: "transaction", ownerId: tx(db).id, file: pdf() }, dir);
    expect(getAttachment(db, a.id)?.filename).toBe("Factura seguro.pdf");
    expect(getAttachment(db, 999)).toBeNull();
    const file = attachmentFilePath(dir, a.path);
    deleteAttachment(db, a.id, dir);
    expect(fs.existsSync(file)).toBe(false);
    expect(getAttachment(db, a.id)).toBeNull();
    expect(() => deleteAttachment(db, a.id, dir)).not.toThrow();
  });

  it("attachmentFilePath rechaza path traversal", () => {
    const dir = tmp();
    expect(() => attachmentFilePath(dir, "../secret.txt")).toThrow(/fuera/);
    expect(() => attachmentFilePath(dir, "2024/../../x")).toThrow(/fuera/);
    expect(attachmentFilePath(dir, "2024/ok.pdf")).toBe(path.join(dir, "attachments", "2024", "ok.pdf"));
  });
});

describe("readAttachmentFile / contentDisposition", () => {
  it("lee bytes y metadatos; null si no existe fila o fichero", () => {
    const db = createTestDb();
    const dir = tmp();
    const a = saveAttachment(db, { ownerType: "transaction", ownerId: tx(db).id, file: pdf("Año 2024.pdf") }, dir);
    const r = readAttachmentFile(db, a.id, dir)!;
    expect(r.bytes.toString()).toBe("%PDF-1.4 test");
    expect(r.attachment.mime).toBe("application/pdf");
    expect(readAttachmentFile(db, 999, dir)).toBeNull();
    fs.rmSync(attachmentFilePath(dir, a.path));
    expect(readAttachmentFile(db, a.id, dir)).toBeNull();
  });
  it("contentDisposition inline con nombre codificado", () => {
    expect(contentDisposition("Año 2024.pdf")).toBe(`inline; filename="Ano_2024.pdf"; filename*=UTF-8''A%C3%B1o%202024.pdf`);
  });
});
