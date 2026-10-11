import { eq } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "@/db/client";
import { attachments, filings, rentalPeriods, transactions, type Attachment } from "@/db/schema";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"];

export type OwnerType = "transaction" | "rentalPeriod" | "filing";
export interface UploadFile {
  name: string;
  type: string;
  bytes: Buffer | Uint8Array;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 100);
  return clean === "" ? "file" : clean;
}

/** Ruta absoluta de un adjunto; rechaza cualquier ruta que salga de `<baseDir>/attachments`. */
export function attachmentFilePath(baseDir: string, relPath: string): string {
  const root = path.resolve(baseDir, "attachments");
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root + path.sep)) throw new Error("Ruta fuera del directorio de adjuntos");
  return full;
}

function ownerYear(db: Db, ownerType: OwnerType, ownerId: number): string {
  if (ownerType === "transaction") {
    const t = db.select().from(transactions).where(eq(transactions.id, ownerId)).get();
    if (!t) throw new Error(`El movimiento ${ownerId} no existe`);
    return t.date.slice(0, 4);
  }
  if (ownerType === "rentalPeriod") {
    const r = db.select().from(rentalPeriods).where(eq(rentalPeriods.id, ownerId)).get();
    if (!r) throw new Error(`El contrato ${ownerId} no existe`);
    return r.startDate.slice(0, 4);
  }
  const f = db.select().from(filings).where(eq(filings.id, ownerId)).get();
  if (!f) throw new Error(`La declaración ${ownerId} no existe`);
  return String(f.year);
}

export function saveAttachment(
  db: Db,
  input: { ownerType: OwnerType; ownerId: number; file: UploadFile },
  baseDir: string,
): Attachment {
  const { file, ownerType, ownerId } = input;
  if (!ALLOWED_MIMES.includes(file.type)) throw new Error(`Tipo de fichero no permitido: ${file.type}`);
  if (file.bytes.length === 0) throw new Error("El fichero está vacío");
  if (file.bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("El fichero supera el máximo de 20 MB");
  const year = ownerYear(db, ownerType, ownerId);

  const rel = `${year}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  const full = attachmentFilePath(baseDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, file.bytes);
  try {
    return db
      .insert(attachments)
      .values({
        transactionId: ownerType === "transaction" ? ownerId : null,
        rentalPeriodId: ownerType === "rentalPeriod" ? ownerId : null,
        filingId: ownerType === "filing" ? ownerId : null,
        filename: file.name,
        path: rel,
        mime: file.type,
        size: file.bytes.length,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
      })
      .returning()
      .get();
  } catch (e) {
    fs.rmSync(full, { force: true });
    throw e;
  }
}

export function getAttachment(db: Db, id: number): Attachment | null {
  return db.select().from(attachments).where(eq(attachments.id, id)).get() ?? null;
}

export function listAttachments(db: Db, owner: { ownerType: OwnerType; ownerId: number }): Attachment[] {
  const col =
    owner.ownerType === "transaction" ? attachments.transactionId : owner.ownerType === "rentalPeriod" ? attachments.rentalPeriodId : attachments.filingId;
  return db.select().from(attachments).where(eq(col, owner.ownerId)).all();
}

export function deleteAttachment(db: Db, id: number, baseDir: string): void {
  const a = getAttachment(db, id);
  if (!a) return;
  fs.rmSync(attachmentFilePath(baseDir, a.path), { force: true });
  db.delete(attachments).where(eq(attachments.id, id)).run();
}

export function readAttachmentFile(db: Db, id: number, baseDir: string): { attachment: Attachment; bytes: Buffer } | null {
  const attachment = getAttachment(db, id);
  if (!attachment) return null;
  const file = attachmentFilePath(baseDir, attachment.path);
  if (!fs.existsSync(file)) return null;
  return { attachment, bytes: fs.readFileSync(file) };
}

export function contentDisposition(filename: string): string {
  return `inline; filename="${sanitizeFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
