import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { dataDir, openDb, type Db } from "../src/db/client";
import { attachments, type Transaction } from "../src/db/schema";
import { parseLiquidacion, splitLiquidacion, type Liquidacion } from "../src/lib/liquidacion";
import { formatEur } from "../src/lib/money";
import { saveAttachment } from "../src/server/attachments";
import { findCategory, seedCategories } from "../src/server/categories";
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from "../src/server/transactions";

export interface LiquidacionFile {
  fileName: string;
  text: string;
  bytes: Buffer;
}

export interface QuarterReport {
  fileName: string;
  year: number;
  quarter: number;
  totalCents: number;
  ordinaryCents: number;
  repairCents: number;
  reserveFundCents: number;
  /** cómo se encontraron los apuntes previos: clave (ya importado) · exacto (suma = total) · fecha (cercanos al pago) · nuevo */
  matched: "clave" | "exacto" | "fecha" | "nuevo";
  previous: { ordinaryCents: number; repairCents: number } | null;
  /** filas sobrantes de la misma categoría fusionadas en la principal */
  merged: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function quarterRange(year: number, quarter: number) {
  const start = `${year}-${pad(quarter * 3 - 2)}-01`;
  const endMonth = quarter * 3;
  return { start, end: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}` };
}

function exactSubset<T extends Transaction>(rows: T[], total: number): T[] | null {
  if (rows.length === 0 || rows.length > 12) return null;
  let best: T[] | null = null;
  for (let mask = 1; mask < 1 << rows.length; mask++) {
    const subset = rows.filter((_, i) => mask & (1 << i));
    if (subset.reduce((a, r) => a + r.amountCents, 0) === total && (!best || subset.length < best.length)) best = subset;
  }
  return best;
}

const REPAIR_CAT = "reparacion y conservacion";
const COMUNIDAD_CAT = "comunidad";
const FONDO_CAT = "fondo de reserva comunidad";

/**
 * Actualiza los apuntes de comunidad con las liquidaciones trimestrales: cuota ordinaria (casilla 5) y
 * reparaciones (límite 1–4), adjunta el PDF a cada uno y crea los que falten. Idempotente.
 */
export function importLiquidaciones(
  db: Db,
  files: LiquidacionFile[],
  baseDir: string,
  opts: { dateOverrides?: Record<string, string> } = {},
): QuarterReport[] {
  seedCategories(db); // idempotente: añade «fondo de reserva comunidad» si la BD es anterior
  const comunidad = findCategory(db, "gastos", "comunidad")!;
  const reparacion = findCategory(db, "gastos", REPAIR_CAT)!;
  const fondo = findCategory(db, "no deducible", FONDO_CAT)!;

  const seen = new Set<string>();
  const parsed = files
    .map((f) => ({ file: f, liq: parseLiquidacion(f.text) }))
    .filter(({ liq }) => {
      const key = `${liq.year}-${liq.quarter}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.liq.year - b.liq.year || a.liq.quarter - b.liq.quarter);

  db.run(sql`BEGIN`);
  try {
    const report = parsed.map(({ file, liq }) => processQuarter(db, file, liq, baseDir, opts.dateOverrides ?? {}, { ord: comunidad.id, rep: reparacion.id, fondo: fondo.id }));
    db.run(sql`COMMIT`);
    return report;
  } catch (e) {
    db.run(sql`ROLLBACK`);
    throw e;
  }
}

function processQuarter(db: Db, file: LiquidacionFile, liq: Liquidacion, baseDir: string, overrides: Record<string, string>, ids: { ord: number; rep: number; fondo: number }): QuarterReport {
  const { year, quarter, totalCents } = liq;
  const label = `${quarter}T ${year}`;
  const keyOrd = `liquidacion:${year}-${quarter}:ordinaria`;
  const keyRep = `liquidacion:${year}-${quarter}:reparacion`;
  const keyFondo = `liquidacion:${year}-${quarter}:fondo`;
  const range = quarterRange(year, quarter);

  const ours = (r: Transaction) => r.externalKey?.startsWith("liquidacion:") === true;
  const candidates = listTransactions(db).rows.filter(
    (r) =>
      r.category &&
      ((r.category.cat1 === "gastos" && [COMUNIDAD_CAT, REPAIR_CAT].includes(r.category.cat2) && (/comunidad/i.test(r.payee ?? "") || ours(r))) ||
        (r.category.cat2 === FONDO_CAT && ours(r))),
  );
  const foreign = (r: Transaction) => ours(r) && ![keyOrd, keyRep, keyFondo].includes(r.externalKey!);

  let matchedRows = candidates.filter((r) => [keyOrd, keyRep, keyFondo].includes(r.externalKey!));
  let matched: QuarterReport["matched"] = "clave";
  if (matchedRows.length === 0) {
    const free = candidates.filter((r) => !foreign(r));
    const window = free.filter((r) => r.date >= range.start && r.date <= addDays(range.end, 45));
    const exact = exactSubset(window, totalCents);
    if (exact) {
      matchedRows = exact;
      matched = "exacto";
    } else {
      matchedRows = free.filter((r) => r.date > range.end && r.date <= addDays(range.end, 45));
      matched = matchedRows.length > 0 ? "fecha" : "nuevo";
    }
  }

  const ordRows = matchedRows.filter((r) => r.category?.cat2 === COMUNIDAD_CAT);
  const repRows = matchedRows.filter((r) => r.category?.cat2 === REPAIR_CAT);
  const fondoRows = matchedRows.filter((r) => r.category?.cat2 === FONDO_CAT);
  const ordRow = ordRows[0];
  const repRow = repRows[0];
  const fondoRow = fondoRows[0];
  const extras = [...ordRows.slice(1), ...repRows.slice(1), ...fondoRows.slice(1)]; // partidas sueltas de la misma liquidación
  const previous = matchedRows.length > 0 ? { ordinaryCents: ordRow?.amountCents ?? 0, repairCents: repRow?.amountCents ?? 0 } : null;

  const split = splitLiquidacion(liq);
  const foldRepairs = split.repairCents <= 0;
  const repairCents = foldRepairs ? 0 : split.repairCents;
  const reserveCents = split.reserveFundCents;
  const ordinaryCents = totalCents - repairCents - reserveCents;
  if (ordinaryCents <= 0) throw new Error(`La cuota ordinaria de ${label} no es positiva: revisa la liquidación`);

  const date = ordRow?.date ?? repRow?.date ?? overrides[`${year}-${quarter}`] ?? range.end;
  const payee = ordRow?.payee ?? repRow?.payee ?? "Comunidad de propietarios";
  const common = { date, kind: "expense" as const, payee, hasInvoice: true, frequency: "trimestral" as const, source: "import" as const };

  const ordNotes = [
    `Liquidación ${label}: total ${formatEur(totalCents)}.`,
    reserveCents > 0 ? `El fondo de reserva (${formatEur(reserveCents)}) se registra aparte como no deducible.` : null,
    foldRepairs && split.repairLines.length > 0 ? `Las reparaciones netas (${formatEur(split.repairCents)}) no son positivas: se incluyen en la cuota ordinaria.` : null,
  ].filter(Boolean).join(" ");
  const fondoNotes = `Aportación al fondo de reserva de la liquidación ${label}: no deducible.`;
  const repNotes = `Reparaciones de la liquidación ${label} (cuota de la vivienda):\n${split.repairLines.map((l) => `- ${l.concept}: ${formatEur(l.shareCents)}`).join("\n")}`;

  const upsert = (row: Transaction | undefined, categoryId: number, amountCents: number, concept: string, notes: string, externalKey: string, frequency: "trimestral" | "unica") => {
    const data = { ...common, frequency, amountCents, concept, notes, categoryId, externalKey };
    return row ? updateTransaction(db, row.id, { ...data, date: row.date, payee: row.payee }) : createTransaction(db, data);
  };

  const ord = upsert(ordRow, ids.ord, ordinaryCents, `Liquidación comunidad ${label}`, ordNotes, keyOrd, "trimestral");
  const owners = [ord];
  if (repairCents > 0) owners.push(upsert(repRow, ids.rep, repairCents, `Liquidación comunidad ${label} – reparaciones`, repNotes, keyRep, "unica"));
  else if (repRow) deleteTransaction(db, repRow.id, baseDir);
  if (reserveCents > 0) owners.push(upsert(fondoRow, ids.fondo, reserveCents, `Liquidación comunidad ${label} – fondo de reserva`, fondoNotes, keyFondo, "unica"));
  else if (fondoRow) deleteTransaction(db, fondoRow.id, baseDir);

  for (const extra of extras) deleteTransaction(db, extra.id, baseDir);

  const sha = createHash("sha256").update(file.bytes).digest("hex");
  for (const t of owners) {
    const has = db.select().from(attachments).where(and(eq(attachments.transactionId, t.id), eq(attachments.sha256, sha))).get();
    if (!has) saveAttachment(db, { ownerType: "transaction", ownerId: t.id, file: { name: file.fileName, type: "application/pdf", bytes: file.bytes } }, baseDir);
  }

  return { fileName: file.fileName, year, quarter, totalCents, ordinaryCents, repairCents, reserveFundCents: reserveCents, matched, previous, merged: extras.length };
}



// ───────────────────────── CLI ─────────────────────────

function readPdfs(dirs: string[]): LiquidacionFile[] {
  const out: LiquidacionFile[] = [];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".pdf")).sort()) {
      const full = path.join(dir, name);
      const text = execFileSync("pdftotext", ["-layout", full, "-"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      try {
        parseLiquidacion(text);
      } catch (e) {
        console.warn(`Se omite ${name}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      out.push({ fileName: name, text, bytes: fs.readFileSync(full) });
    }
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dateOverrides: Record<string, string> = {};
  const dirs: string[] = [];
  for (const a of args) {
    const m = /^--date=(\d{4}-\d)=(\d{4}-\d{2}-\d{2})$/.exec(a);
    if (m) dateOverrides[m[1]] = m[2];
    else dirs.push(a);
  }
  if (dirs.length === 0) throw new Error("Uso: npm run import:comunidad -- <carpeta con PDFs>... [--date=2026-3=2026-10-07]");
  const report = importLiquidaciones(openDb(), readPdfs(dirs), dataDir(), { dateOverrides });
  for (const r of report) {
    const prev = r.previous ? `antes ${formatEur(r.previous.ordinaryCents)} + ${formatEur(r.previous.repairCents)}` : "sin apunte previo";
    console.log(`${r.quarter}T ${r.year} [${r.matched}] total ${formatEur(r.totalCents)} → cuota ${formatEur(r.ordinaryCents)} + reparaciones ${formatEur(r.repairCents)} (fondo reserva ${formatEur(r.reserveFundCents)}) · ${prev}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) main();
