import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq } from "drizzle-orm";
import { dataDir, openDb, type Db } from "../src/db/client";
import { attachments, filings, transactions } from "../src/db/schema";
import { parseDateEs } from "../src/lib/dates";
import { parseAmountEs } from "../src/lib/money";
import { saveAttachment } from "../src/server/attachments";
import { findCategory } from "../src/server/categories";
import { upsertYearParams } from "../src/server/properties";
import { generateIncomeFromRental, listRentalPeriods } from "../src/server/rentals";

export interface SheetData {
  gastos: string[][];
  cuadro: string[][];
  ibi: string[][];
}

export interface ImportSummary {
  gastos: number;
  uncategorized: number;
  interests: number;
  earlyRepayments: number;
  ibiReceipts: number;
  rents: number;
  fianzas: number;
  /** filas nuevas insertadas en esta ejecución (0 si ya estaba todo) */
  created: number;
}

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const cells = (row: string[], n: number) => Array.from({ length: n }, (_, i) => (row[i] ?? "").trim());

type CatKey = [string, string];

const SIMPLE_MAP: Record<string, CatKey> = {
  "gastos|impuestos": ["gastos", "impuestos"],
  "suministros|agua": ["suministros", "agua"],
  "amortizaciones|muebles": ["amortizaciones", "muebles y electrodomesticos"],
  "gastos|reparacion y conservacion": ["gastos", "reparacion y conservacion"],
  "gastos|gastos de reparacion y conservacion": ["gastos", "reparacion y conservacion"],
  "gastos|seguros": ["gastos", "seguros"],
  "gastos|gastos de comunidad": ["gastos", "comunidad"],
};

const ACQUISITION_BY_CONCEPT: Record<string, string> = {
  "compra vivienda": "precio de compra",
  itp: "ITP",
  "gastos notaria": "notaria",
  "gastos registro": "registro",
  "gastos gestoria": "gestoria",
  "gastos mensajeria": "gestoria",
  intermediacion: "intermediacion inmobiliaria",
};

/** Mapeo de categorías de la hoja a las de la app (PRD §7). `null` = pendiente de categorizar. */
export function mapSheetCategory(cat1: string, cat2: string, concept: string): CatKey | null {
  const key = `${norm(cat1)}|${norm(cat2)}`;
  if (key === "gastos|gastos de financiacion") {
    const c2 = ACQUISITION_BY_CONCEPT[norm(concept)];
    return c2 ? ["adquisicion", c2] : null;
  }
  if (key === "gastos|financiacion" && norm(concept) === "contrato gestion arrendamiento") return ["gastos", "formalizacion contrato"];
  return SIMPLE_MAP[key] ?? null;
}

const FREQUENCIES = ["mensual", "trimestral", "anual"] as const;

export function importFromSheetData(db: Db, data: SheetData, today: string): ImportSummary {
  const summary: ImportSummary = { gastos: 0, uncategorized: 0, interests: 0, earlyRepayments: 0, ibiReceipts: 0, rents: 0, fianzas: 0, created: 0 };
  const catId = (c1: string, c2: string) => {
    const c = findCategory(db, c1, c2);
    if (!c) throw new Error(`Falta la categoría ${c1} / ${c2}: ejecuta antes el seed`);
    return c.id;
  };
  const insert = (values: typeof transactions.$inferInsert): boolean => {
    const inserted = db.insert(transactions).values({ source: "import", ...values }).onConflictDoNothing().returning({ id: transactions.id }).all().length > 0;
    if (inserted) summary.created += 1;
    return inserted;
  };

  // 1. Pestaña de gastos (IRNR_SHEET_TAB_EXPENSES)
  const seen = new Map<string, number>();
  for (const raw of data.gastos.slice(1)) {
    const [date, pvp, payee, concept, c1, c2, taxes, freq] = cells(raw, 8);
    if (!date && !pvp && !concept) continue;
    const base = [date, pvp, payee, concept, c1, c2, taxes, freq].map(norm).join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const mapped = mapSheetCategory(c1, c2, concept);
    summary.gastos += 1;
    if (!mapped) summary.uncategorized += 1;
    insert({
      date: parseDateEs(date),
      kind: "expense",
      amountCents: parseAmountEs(pvp),
      payee: payee || null,
      concept,
      categoryId: mapped ? catId(...mapped) : null,
      hasInvoice: norm(taxes) === "si",
      frequency: FREQUENCIES.find((f) => f === norm(freq)) ?? "unica",
      externalKey: sha1(`gastos|${base}|${n}`),
    });
  }

  // 2. Cuadro de amortización: intereses y amortizaciones anticipadas de capital
  for (const raw of data.cuadro.slice(1)) {
    const c = cells(raw, 13);
    let date: string;
    try {
      date = parseDateEs(c[1]);
    } catch {
      continue;
    }
    if (date > today) continue;
    const base = c.map(norm).join("|");
    const interest = parseAmountEs(c[5]);
    if (interest > 0) {
      summary.interests += 1;
      insert({ date, kind: "expense", amountCents: interest, payee: "Banco", concept: "Intereses hipoteca", categoryId: catId("gastos", "intereses hipoteca"), frequency: "mensual", externalKey: sha1(`cuadro|interes|${base}`) });
    }
    if (c[7] !== "") {
      summary.earlyRepayments += 1;
      insert({ date, kind: "expense", amountCents: parseAmountEs(c[7]), payee: "Banco", concept: "Amortización anticipada de capital", categoryId: catId("no deducible", "amortizacion capital prestamo"), externalKey: sha1(`cuadro|capital|${base}`) });
    }
  }

  // 3. IBI: valores catastrales por año y recibos 2025/2026
  const header = data.ibi.findIndex((r) => r.some((c) => norm(c) === "valor catastral suelo"));
  if (header >= 0) {
    const values = cells(data.ibi[header + 1] ?? [], 3);
    const land = parseAmountEs(values[1]);
    const building = parseAmountEs(values[2]);
    for (let year = 2023; year <= Number(today.slice(0, 4)); year++) {
      upsertYearParams(db, { year, cadastralLandCents: land, cadastralBuildingCents: building });
    }
  }
  for (const year of [2025, 2026]) {
    const date = `${year}-04-30`;
    if (date > today) continue;
    summary.ibiReceipts += 1;
    insert({ date, kind: "expense", amountCents: 14_466, payee: "Ayuntamiento", concept: `IBI ${year}`, categoryId: catId("gastos", "impuestos"), hasInvoice: true, externalKey: `ibi:${year}` });
  }

  // 4. Rentas desde los contratos y fianzas
  for (const rental of listRentalPeriods(db)) {
    const created = generateIncomeFromRental(db, rental.id, { until: today });
    summary.rents += created;
    summary.created += created;
    if (rental.startDate <= today) {
      summary.fianzas += 1;
      insert({ date: rental.startDate, kind: "income", amountCents: rental.monthlyRentCents, payee: rental.tenant, concept: "Fianza", categoryId: catId("ingresos", "fianza"), externalKey: `fianza:${rental.id}` });
    }
  }
  return summary;
}

// ───────────────────────── Ejecución real (gws) ─────────────────────────

/** `210_..._2023.pdf` → ejercicio en el grupo 1. */
export const FILING_PDF = /^210_.*?(\d{4})\.pdf$/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (ver README)`);
  return value;
}
const SHEET_ID = (): string => requireEnv("IRNR_SHEET_ID");
const FOLDERS = { main: () => requireEnv("IRNR_DRIVE_FOLDER_MAIN"), taxes: () => requireEnv("IRNR_DRIVE_FOLDER_TAXES") };

function gws(args: string[]): string {
  return execFileSync("gws", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ? { GOOGLE_WORKSPACE_CLI_CONFIG_DIR: process.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR } : {}) },
  });
}

/** La salida puede empezar con "Using keyring backend: keyring": descarta hasta el primer `{`. */
export function parseGwsJson(output: string): unknown {
  return JSON.parse(output.slice(output.indexOf("{")));
}

function readRange(range: string): string[][] {
  const out = parseGwsJson(gws(["sheets", "+read", "--spreadsheet", SHEET_ID(), "--range", range])) as { values?: string[][] };
  return out.values ?? [];
}

type Target = { kind: "transaction"; where: () => number | undefined } | { kind: "filing"; where: () => number[] };

/** Documentos de Drive → movimiento/declaración al que se vinculan (por nombre; tabla explícita). */
function driveTargets(db: Db): { folder: keyof typeof FOLDERS; match: RegExp; target: Target }[] {
  const tx = (concept: string, date?: string) => () =>
    db.select({ id: transactions.id }).from(transactions).where(date ? and(eq(transactions.concept, concept), eq(transactions.date, date)) : eq(transactions.concept, concept)).get()?.id;
  return [
    { folder: "taxes", match: /^IBI_2025\.pdf$/i, target: { kind: "transaction", where: tx("IBI 2025") } },
    { folder: "taxes", match: /^IBI_2026\.pdf$/i, target: { kind: "transaction", where: tx("IBI 2026") } },
    { folder: "taxes", match: FILING_PDF, target: { kind: "filing", where: () => [] } },
    { folder: "main", match: /^FRA_lavadora_nevera\.pdf$/i, target: { kind: "transaction", where: tx("Nevera y Lavadora") } },
    { folder: "main", match: /^pago_seguro_vivienda_2023\.pdf$/i, target: { kind: "transaction", where: tx("seguro vivienda", "2023-10-04") } },
    { folder: "main", match: /^contrato_mediacion\.pdf$/i, target: { kind: "transaction", where: tx("Contrato Gestion Arrendamiento") } },
  ];
}

export function importDriveAttachments(db: Db, baseDir: string): number {
  let attached = 0;
  for (const folder of Object.keys(FOLDERS) as (keyof typeof FOLDERS)[]) {
    const listing = parseGwsJson(gws(["drive", "files", "list", "--params", JSON.stringify({ q: `'${FOLDERS[folder]()}' in parents and trashed = false`, fields: "files(id,name)", pageSize: 200 })])) as { files?: { id: string; name: string }[] };
    for (const file of listing.files ?? []) {
      for (const t of driveTargets(db).filter((x) => x.folder === folder && x.match.test(file.name))) {
        const owners: { ownerType: "transaction" | "filing"; ownerId: number }[] = [];
        if (t.target.kind === "transaction") {
          const id = t.target.where();
          if (id !== undefined) owners.push({ ownerType: "transaction", ownerId: id });
        } else {
          const year = Number(t.match.exec(file.name)![1]);
          for (const f of db.select().from(filings).where(eq(filings.year, year)).all()) owners.push({ ownerType: "filing", ownerId: f.id });
        }
        if (owners.length === 0) {
          console.warn(`Sin destino para ${file.name}`);
          continue;
        }
        const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "irnr-drive-")), file.name);
        gws(["drive", "files", "get", "--params", JSON.stringify({ fileId: file.id, alt: "media" }), "-o", tmp]);
        const bytes = fs.readFileSync(tmp);
        fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
        const sha = createHash("sha256").update(bytes).digest("hex");
        for (const o of owners) {
          const col = o.ownerType === "transaction" ? attachments.transactionId : attachments.filingId;
          if (db.select().from(attachments).where(and(eq(col, o.ownerId), eq(attachments.sha256, sha))).get()) continue;
          saveAttachment(db, { ...o, file: { name: file.name, type: "application/pdf", bytes } }, baseDir);
          attached += 1;
        }
      }
    }
  }
  return attached;
}

function main() {
  const db = openDb();
  const today = process.env.IRNR_TODAY ?? new Date().toISOString().slice(0, 10);
  const data: SheetData = {
    gastos: readRange(`${process.env.IRNR_SHEET_TAB_EXPENSES ?? "Gastos"}!A1:H500`),
    cuadro: readRange("Cuadro de Amortizacion!A10:M400"),
    ibi: readRange("IBI!A1:F10"),
  };
  console.log("Importación:", importFromSheetData(db, data, today));
  if (process.argv.includes("--with-drive")) console.log("Adjuntos de Drive vinculados:", importDriveAttachments(db, dataDir()));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === pathToFileURL(__filename).href) main();

