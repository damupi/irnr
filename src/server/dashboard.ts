import type { Db } from "@/db/client";
import { daysBetweenInclusive } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import type { FilingStatusResult } from "@/lib/tax/deadlines";
import type { Deadline } from "@/lib/tax/types";
import { listRentalPeriods } from "./rentals";
import { getTaxYear, type TaxYearView } from "./taxYear";
import { listTransactions, type TransactionRow } from "./transactions";

export interface Alert {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  count?: number;
  href: string;
}

const DEDUCTIBLE_TREATMENTS = ["deductible", "capped_1_4", "furniture_10", "improvement_3"];
const PER_YEAR = { mensual: 12, trimestral: 4, anual: 1 } as const;

const link = (year: number, flag: string) => `/movimientos?year=${year}&${flag}=1`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const norm = (s: string) => s.trim().toLowerCase();

export function getAlerts(db: Db, year: number, today: string): Alert[] {
  const alerts: Alert[] = [];
  const rows = listTransactions(db, { year }).rows;

  const uncategorized = rows.filter((r) => !r.category).length;
  if (uncategorized > 0) {
    alerts.push({
      code: "uncategorized", severity: "warning", count: uncategorized, href: link(year, "uncategorized"),
      message: `${uncategorized} ${plural(uncategorized, "movimiento sin categoría", "movimientos sin categoría")}`,
    });
  }

  const deductibles = rows.filter((r) => r.kind === "expense" && r.category && DEDUCTIBLE_TREATMENTS.includes(r.category.treatment));
  const noInvoice = deductibles.filter((r) => !r.hasInvoice).length;
  if (noInvoice > 0) {
    alerts.push({
      code: "no_invoice", severity: "warning", count: noInvoice, href: link(year, "noInvoice"),
      message: `${noInvoice} ${plural(noInvoice, "gasto deducible sin factura", "gastos deducibles sin factura")}`,
    });
  }
  const noAttachment = deductibles.filter((r) => r.attachmentCount === 0).length;
  if (noAttachment > 0) {
    alerts.push({
      code: "no_attachment", severity: "info", count: noAttachment, href: link(year, "noAttachment"),
      message: `${noAttachment} ${plural(noAttachment, "gasto deducible sin adjunto", "gastos deducibles sin adjunto")}`,
    });
  }

  alerts.push(...incomeAlerts(db, year, today, rows));
  alerts.push(...recurringAlerts(db, year, today));
  alerts.push(...taxAlerts(db, year, today));
  return alerts;
}

function incomeAlerts(db: Db, year: number, today: string, rows: TransactionRow[]): Alert[] {
  const periods = listRentalPeriods(db);
  const incomeMonths = new Set(rows.filter((r) => r.category?.treatment === "income").map((r) => r.date.slice(0, 7)));
  const todayYear = Number(today.slice(0, 4));
  if (year > todayYear) return [];

  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    const start = `${year}-${String(m).padStart(2, "0")}-01`;
    if (start > today) break;
    const end = `${year}-${String(m).padStart(2, "0")}-31`;
    const covered = periods.some((p) => p.startDate <= end && (!p.endDate || p.endDate >= start));
    if (covered) months.push(start.slice(0, 7));
  }
  if (months.length === 0) return [];

  const href = `/movimientos?year=${year}&kind=income`;
  if (incomeMonths.size === 0) {
    return [{ code: "no_income", severity: "error", href, message: `Hay contrato vigente en ${year} pero no hay ingresos registrados` }];
  }
  const missing = months.filter((m) => !incomeMonths.has(m));
  if (missing.length === 0) return [];
  return [{
    code: "missing_rent_months", severity: "warning", count: missing.length, href,
    message: `Falta la renta de ${missing.length} ${plural(missing.length, "mes", "meses")} con contrato vigente: ${missing.join(", ")}`,
  }];
}

function recurringAlerts(db: Db, year: number, today: string): Alert[] {
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  const effYear = (r: TransactionRow) => r.taxYearOverride ?? Number(r.date.slice(0, 4));
  const recurring = listTransactions(db).rows.filter((r) => r.frequency !== "unica" && [year, year - 1].includes(effYear(r)));

  const groups = new Map<string, TransactionRow[]>();
  for (const r of recurring) {
    const key = `${r.categoryId}|${norm(r.payee || r.concept)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const missing: string[] = [];
  for (const group of groups.values()) {
    const freq = group[0].frequency as keyof typeof PER_YEAR;
    const current = group.filter((r) => effYear(r) === year);
    const previous = group.filter((r) => effYear(r) === year - 1);
    let expected = 0;
    if (year < todayYear) expected = PER_YEAR[freq];
    else if (year === todayYear) {
      if (freq === "mensual") expected = todayMonth;
      else if (freq === "trimestral") expected = Math.ceil(todayMonth / 3);
      else expected = previous.some((r) => Number(r.date.slice(5, 7)) <= todayMonth) || current.length > 0 ? 1 : 0;
    }
    // Una serie que empieza a mitad de año (sin apuntes el año anterior) solo se exige desde su primer periodo.
    if (freq !== "anual" && previous.length === 0 && current.length > 0) {
      const index = (r: TransactionRow) => (freq === "mensual" ? Number(r.date.slice(5, 7)) : Math.ceil(Number(r.date.slice(5, 7)) / 3));
      expected = Math.max(0, expected - (Math.min(...current.map(index)) - 1));
    }
    const lacking = expected - current.length;
    if (lacking > 0) missing.push(`${group[0].payee || group[0].concept} (${lacking})`);
  }
  if (missing.length === 0) return [];
  return [{
    code: "missing_recurring", severity: "warning", count: missing.length, href: `/movimientos?year=${year}`,
    message: `Recurrentes que faltan: ${missing.join(", ")}`,
  }];
}

function taxAlerts(db: Db, year: number, today: string): Alert[] {
  let view: TaxYearView;
  try {
    view = getTaxYear(db, year, today);
  } catch {
    return []; // sin inmueble o sin parámetros del ejercicio: no hay cálculo del que avisar
  }
  const alerts: Alert[] = [];
  const href = `/declaracion/${year}`;
  const { carryforward } = view.result;

  if (carryforward.expired.length > 0) {
    const total = carryforward.expired.reduce((a, p) => a + p.cents, 0);
    alerts.push({
      code: "carryforward_expired", severity: "info", count: carryforward.expired.length, href,
      message: `Ha caducado arrastre de ${carryforward.expired.map((p) => p.originYear).join(", ")} (${formatEur(total)})`,
    });
  }
  const expiring = carryforward.pending.filter((p) => p.originYear <= year - 4);
  if (expiring.length > 0) {
    alerts.push({
      code: "carryforward_expiring", severity: "warning", count: expiring.length, href,
      message: `El arrastre de ${expiring.map((p) => p.originYear).join(", ")} caduca este año si no se aplica`,
    });
  }

  const entries: [string, Deadline | null, FilingStatusResult | null][] = [
    ["210 tipo 01", view.result.deadlines.rendimientos, view.status.rendimientos],
    ["210 tipo 02", view.result.deadlines.imputada, view.status.imputada],
  ];
  for (const [label, deadline, status] of entries) {
    if (!deadline || !status) continue;
    if (status.status === "overdue") {
      const cost = status.interestDue
        ? `recargo del ${status.surchargePct} % e intereses de demora`
        : `recargo del ${status.surchargePct} %`;
      alerts.push({ code: "deadline_overdue", severity: "error", href, message: `${label} de ${year} vencido el ${deadline.to}: ${cost}` });
    } else if (status.status === "pending") {
      const left = daysBetweenInclusive(today, deadline.to) - 1;
      if (left < 60) {
        alerts.push({ code: "deadline_soon", severity: "warning", href, message: `${label} de ${year}: quedan ${left} ${plural(left, "día", "días")} (plazo hasta ${deadline.to})` });
      }
    }
  }
  return alerts;
}
