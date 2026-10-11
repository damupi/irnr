/** Importes siempre en céntimos enteros. Solo se formatea en la UI. */

export function parseAmountEs(input: string): number {
  let s = input.replace(/[€\s ]/g, "");
  if (s === "") throw new Error(`Importe vacío`);
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Importe no válido: "${input}"`);
  const [, sign, int, frac = ""] = m;
  const digits = (frac + "00").slice(0, 2);
  let cents = Number(int) * 100 + Number(digits);
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1; // half-up exacto, sin floats
  return sign ? -cents : cents;
}

/** "1.234,56" (sin símbolo): para campos editables. */
export function formatAmountEs(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${int},${String(abs % 100).padStart(2, "0")}`;
}

export function formatEur(cents: number): string {
  return `${formatAmountEs(cents)}\u00a0€`;
}
