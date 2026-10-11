import { AlertTriangle, CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import { BoxesBars } from "@/components/charts/boxes-bars";
import { MonthlyBars } from "@/components/charts/monthly-bars";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/db/client";
import { BOX_LABELS } from "@/lib/boxes";
import { formatDateEs } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { getAlerts, type Alert } from "@/server/dashboard";
import { STATUS_LABEL } from "@/server/status";
import { getTaxYear, type TaxYearView } from "@/server/taxYear";
import { today } from "@/server/today";
import { listTransactions } from "@/server/transactions";
import { defaultYear, parseYear } from "@/server/year";

export const dynamic = "force-dynamic";

const ICON = { error: CircleAlert, warning: AlertTriangle, info: Info } as const;
const SEVERITY_CLASS: Record<Alert["severity"], string> = {
  error: "border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

function tryTaxYear(year: number, now: string): TaxYearView | null {
  try {
    return getTaxYear(getDb(), year, now);
  } catch {
    return null;
  }
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = getDb();
  const now = today();
  const year = parseYear((await searchParams).year, defaultYear(db, now));
  const view = tryTaxYear(year, now);
  const alerts = getAlerts(db, year, now);
  const currentYear = Number(now.slice(0, 4));
  const cards = Array.from({ length: Math.max(currentYear, year) - 2023 + 1 }, (_, i) => 2023 + i).map((y) => ({ y, view: tryTaxYear(y, now) }));

  const income = Array<number>(12).fill(0);
  const expenses = Array<number>(12).fill(0);
  for (const r of listTransactions(db, { year }).rows) {
    (r.kind === "income" ? income : expenses)[Number(r.date.slice(5, 7)) - 1] += r.amountCents;
  }

  const rend = view?.result.rendimientos ?? null;
  const imp = view?.result.imputada ?? null;
  const boxData = rend
    ? [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].filter((b) => rend.boxes[b] > 0).map((b) => ({ casilla: `Casilla ${b}`, importe: rend.boxes[b] / 100, name: BOX_LABELS[b] }))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ejercicio {year}</h1>

      {!view && <p role="alert" className="text-destructive">Faltan los parámetros del ejercicio {year}. Configúralos en Configuración.</p>}

      {view && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard id="ingresos" label="Ingresos íntegros" value={formatEur(rend?.grossCents ?? 0)} />
          <KpiCard id="gastos" label="Gastos deducibles (casilla 17)" value={formatEur(rend?.boxes[17] ?? 0)} />
          <KpiCard id="base" label="Base imponible" value={formatEur(rend?.baseCents ?? 0)} />
          <KpiCard id="cuota" label="Cuota estimada (tipo 01)" value={formatEur(rend?.taxCents ?? 0)} />
          <KpiCard id="imputada" label="Renta imputada (base)" value={formatEur(imp?.baseCents ?? 0)} hint={`Cuota ${formatEur(imp?.taxCents ?? 0)}`} />
          <KpiCard id="dias" label="Días alquilado / imputados" value={`${view.result.days.rented} / ${view.result.days.imputed}`} hint={`${view.result.days.rented} alquilados · ${view.result.days.imputed} imputados`} />
          <KpiCard id="total" label="Total a pagar (01 + 02)" value={formatEur((rend?.taxCents ?? 0) + (imp?.taxCents ?? 0))} />
        </div>
      )}

      <section aria-label="Alertas" className="space-y-2">
        <h2 className="text-lg font-semibold">Alertas</h2>
        {alerts.length === 0 && <p className="text-sm text-muted-foreground">Todo en orden.</p>}
        <ul className="space-y-2">
          {alerts.map((a) => {
            const Icon = ICON[a.severity];
            return (
              <li key={`${a.code}-${a.message}`}>
                <Link href={a.href} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:opacity-80 ${SEVERITY_CLASS[a.severity]}`}>
                  <Icon className="size-4 shrink-0" />
                  {a.message}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ejercicios</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ y, view: v }) => (
            <Link key={y} href={`/declaracion/${y}`} data-testid={`year-${y}`} className="space-y-2 rounded-lg border p-3 hover:bg-accent">
              <p className="font-semibold">{y}</p>
              {!v && <p className="text-xs text-muted-foreground">Sin parámetros</p>}
              {v && ([["Tipo 01", v.status.rendimientos, v.result.deadlines.rendimientos, v.filings.rendimientos?.taxCents, v.result.rendimientos?.taxCents], ["Tipo 02", v.status.imputada, v.result.deadlines.imputada, v.filings.imputada?.taxCents, v.result.imputada?.taxCents]] as const).map(
                ([label, status, deadline, filed, computed]) =>
                  status && deadline ? (
                    <div key={label} className="space-y-0.5 text-xs">
                      <Badge variant="outline">{label} · {STATUS_LABEL[status.status]}</Badge>
                      <p className="text-muted-foreground">Plazo hasta {formatDateEs(deadline.to)}</p>
                      <p>Calculada {formatEur(computed ?? 0)}{filed !== undefined && <> · presentada {formatEur(filed)}</>}</p>
                    </div>
                  ) : null,
              )}
              {v && !v.status.rendimientos && !v.status.imputada && <p className="text-xs text-muted-foreground">Sin obligación declarativa</p>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Ingresos y gastos por mes</h2>
          <MonthlyBars income={income} expenses={expenses} />
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Gastos por casilla</h2>
          <BoxesBars data={boxData.map(({ casilla, importe }) => ({ casilla, importe }))} />
        </section>
      </div>
    </div>
  );
}
