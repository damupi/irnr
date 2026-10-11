/** Fecha "hoy" ISO (local). `IRNR_TODAY` la fija en tests E2E. */
export function today(): string {
  if (process.env.IRNR_TODAY) return process.env.IRNR_TODAY;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
