/** Fechas como texto ISO `YYYY-MM-DD`, sin zonas horarias. */

export interface DateRange {
  start: string;
  end: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function daysInMonth(year: number, month: number): number {
  return [31, daysInYear(year) === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function parseDateEs(input: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!m) throw new Error(`Fecha no válida: "${input}"`);
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new Error(`Fecha no válida: "${input}"`);
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const toUtcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

export function daysBetweenInclusive(start: string, end: string): number {
  return Math.max(0, toUtcDay(end) - toUtcDay(start) + 1);
}

export function clampRangeToYear(range: DateRange, year: number): { start: string; end: string } | null {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const start = range.start > yStart ? range.start : yStart;
  const end = range.end !== null && range.end < yEnd ? range.end : yEnd;
  return start > end ? null : { start, end };
}

/** Suma meses a una fecha ISO; si el día no existe en el mes destino, usa el último día. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
