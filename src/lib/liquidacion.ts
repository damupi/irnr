import { parseAmountEs } from "./money";

/** Una partida de la liquidación trimestral de la comunidad, con la cuota que corresponde a la vivienda. */
export interface LiquidacionLine {
  group: number;
  date: string | null;
  concept: string;
  shareCents: number;
}

export interface Liquidacion {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** «Total a pagar por usted» */
  totalCents: number;
  lines: LiquidacionLine[];
  linesTotalCents: number;
}

const AMOUNT = String.raw`(-\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*€`;
const TWO_AMOUNTS = new RegExp(`${AMOUNT}\\s+${AMOUNT}\\s*$`);
const SKIP = /^(GRUPO\s+\d|REPARTO DE GASTO|FECHA\s+CONCEPTOS|TOTAL\s|A PAGAR POR|SU PARTICIPACION|PARTICIPACION)/i;

const signed = (neg: string | undefined, num: string) => (neg ? -1 : 1) * parseAmountEs(num);

function isoDate(d: string): string {
  const [dd, mm, yy] = d.split("-");
  return `20${yy}-${mm}-${dd}`;
}

export function parseLiquidacion(text: string): Liquidacion {
  const start = text.search(/COMUNIDAD:/i);
  if (start < 0) throw new Error("No parece una liquidación de comunidad");
  const body = text.slice(start);

  const period = /(\d)\s*(?:ER|º|O|RO|TO)?\.?\s*TRIMESTRE\s+(\d{4})/i.exec(body);
  if (!period) throw new Error("No encuentro el periodo (trimestre y año)");
  const total = /TOTAL A PAGAR POR USTED[^\n]*?(-?\s*[\d.]+,\d{2})\s*€/i.exec(body);
  if (!total) throw new Error("No encuentro el total a pagar");

  const lines: LiquidacionLine[] = [];
  let group = 0;
  let pending = "";
  for (const raw of body.split("\n")) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (line === "") continue;
    if (/^TOTAL LIQUIDACION/i.test(line)) break;
    const g = /^GRUPO\s+(\d)/i.exec(line);
    if (g) group = Number(g[1]);
    if (SKIP.test(line)) {
      pending = "";
      continue;
    }
    const m = TWO_AMOUNTS.exec(line);
    if (!m) {
      if (/^(COMUNIDAD:|\d\s*\S{0,3}\s*TRIMESTRE\s+\d{4}\s*\()/i.test(line)) continue;
      pending = `${pending} ${line}`.trim();
      continue;
    }
    const text2 = line.slice(0, m.index).trim();
    const dated = /^(\d{2}-\d{2}-\d{2})\s*(.*)$/.exec(text2) ?? /^(\d{2}-\d{2}-\d{2})\s*(.*)$/.exec(pending);
    const date = dated ? isoDate(dated[1]) : null;
    const dateInPending = !/^(\d{2}-\d{2}-\d{2})/.test(text2) && dated !== null;
    const concept = (dateInPending ? `${pending.replace(/^\d{2}-\d{2}-\d{2}\s*/, "")} ${text2}` : `${pending} ${dated ? dated[2] : text2}`.trim())
      .replace(/\s+/g, " ")
      .trim();
    pending = "";
    const share = signed(m[3], m[4]);
    if (concept === "" || (share === 0 && signed(m[1], m[2]) === 0)) continue;
    lines.push({ group, date, concept, shareCents: share });
  }
  return {
    year: Number(period[2]),
    quarter: Number(period[1]) as 1 | 2 | 3 | 4,
    totalCents: parseAmountEs(total[1].replace(/\s/g, "")),
    lines,
    linesTotalCents: lines.reduce((a, l) => a + l.shareCents, 0),
  };
}

const REPAIR = /REPARACION|REPRACION|TRABAJOS|SANEADO|CAMBIO DE MONTANTE|MODULO COCINA|SUSTITUCION TRAMO|CATA EN VIVIENDA|INDEMNIZACION/i;
const NOT_REPAIR = /PRORRATEO|FONDO|TRASPASO|AUDITORIA/i;

/**
 * Reparación = obras o reparaciones explícitas (y la indemnización del seguro que las compensa).
 * El resto (limpieza, luz, ascensor, honorarios, seguros, fondo de reserva, sustitución de pequeños elementos) es cuota ordinaria.
 */
export function classifyLine(concept: string): "repair" | "ordinary" {
  return REPAIR.test(concept) && !NOT_REPAIR.test(concept) ? "repair" : "ordinary";
}

export interface LiquidacionSplit {
  repairCents: number;
  ordinaryCents: number;
  /** aportación al fondo de reserva incluida en la cuota ordinaria (deducibilidad por confirmar) */
  reserveFundCents: number;
  repairLines: LiquidacionLine[];
}

export function splitLiquidacion(liq: Liquidacion): LiquidacionSplit {
  const repairLines = liq.lines.filter((l) => classifyLine(l.concept) === "repair");
  const repairCents = repairLines.reduce((a, l) => a + l.shareCents, 0);
  return {
    repairCents,
    ordinaryCents: liq.totalCents - repairCents,
    reserveFundCents: liq.lines.filter((l) => /FONDO/i.test(l.concept)).reduce((a, l) => a + l.shareCents, 0),
    repairLines,
  };
}
