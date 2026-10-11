import { notFound } from "next/navigation";
import { BoxRow, type BoxLine } from "@/components/box-row";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { BOX_LABELS } from "@/lib/boxes";
import { formatDateEs } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getProperty } from "@/server/properties";
import { getTaxYear, type TaxYearView } from "@/server/taxYear";
import { today } from "@/server/today";
import { listTransactions } from "@/server/transactions";
import { STATUS_LABEL } from "@/server/status";

export const dynamic = "force-dynamic";

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Comparison({ view }: { view: TaxYearView }) {
  const { rendimientos, imputada } = view.result;
  const lines: { label: string; filed: number; computed: number }[] = [];
  const f1 = view.filings.rendimientos;
  const f2 = view.filings.imputada;
  if (f1) {
    lines.push(
      { label: "Tipo 01 · Ingresos íntegros", filed: f1.grossCents, computed: rendimientos?.grossCents ?? 0 },
      { label: "Tipo 01 · Gastos deducibles", filed: f1.expensesCents, computed: rendimientos?.boxes[17] ?? 0 },
      { label: "Tipo 01 · Base", filed: f1.baseCents, computed: rendimientos?.baseCents ?? 0 },
      { label: "Tipo 01 · Cuota", filed: f1.taxCents, computed: rendimientos?.taxCents ?? 0 },
    );
  }
  if (f2) {
    lines.push(
      { label: "Tipo 02 · Base", filed: f2.baseCents, computed: imputada?.baseCents ?? 0 },
      { label: "Tipo 02 · Cuota", filed: f2.taxCents, computed: imputada?.taxCents ?? 0 },
    );
  }
  const filedTax = (f1?.taxCents ?? 0) + (f2?.taxCents ?? 0);
  const computedTax = (f1 ? (rendimientos?.taxCents ?? 0) : 0) + (f2 ? (imputada?.taxCents ?? 0) : 0);
  const diff = computedTax - filedTax;
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="font-normal">Concepto</th><th className="text-right font-normal">Presentado</th><th className="text-right font-normal">Calculado</th><th className="text-right font-normal">Diferencia</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-t">
              <td className="py-1">{l.label}</td>
              <td className="text-right tabular-nums">{formatEur(l.filed)}</td>
              <td className="text-right tabular-nums">{formatEur(l.computed)}</td>
              <td className="text-right tabular-nums">{formatEur(l.computed - l.filed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm font-medium">
        {diff < 0 && `Posible rectificación a favor del contribuyente: ${formatEur(-diff)} menos de cuota que lo presentado.`}
        {diff > 0 && `Posible rectificación en contra: ${formatEur(diff)} más de cuota que lo presentado.`}
        {diff === 0 && "La cuota calculada coincide con la presentada."}
      </p>
    </div>
  );
}

export default async function DeclaracionPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) notFound();
  const db = getDb();
  const now = today();
  let view: TaxYearView;
  try {
    view = getTaxYear(db, year, now);
  } catch (e) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Declaración {year}</h1>
        <p role="alert" className="text-destructive">{e instanceof Error ? e.message : String(e)}. Configúralo en Configuración.</p>
      </div>
    );
  }
  const { result } = view;
  const property = getProperty(db)!;
  const info = new Map(listTransactions(db).rows.map((r) => [r.id, { concept: r.concept, date: r.date }]));
  const lines = (box: number): BoxLine[] =>
    (result.rendimientos?.detail[box] ?? []).map((d) => ({
      concept: info.get(d.txId)?.concept ?? `#${d.txId}`,
      date: info.get(d.txId)?.date ?? null,
      rawCents: d.rawCents,
      computedCents: d.computedCents,
    }));
  const rend = result.rendimientos;
  const imp = result.imputada;
  const hasFiling = view.filings.rendimientos || view.filings.imputada;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Declaración {year}</h1>
        <a className={cn(buttonVariants({ variant: "outline" }), "print:hidden")} href={`/declaracion/${year}/anexo.csv`} download={`anexo-${year}.csv`}>Exportar CSV del anexo</a>
        <a className={cn(buttonVariants({ variant: "outline" }), "print:hidden")} href={`/declaracion/${year}/movimientos.csv`} download={`movimientos-${year}.csv`}>Exportar CSV de movimientos</a>
        <PrintButton />
      </div>

      {result.warnings.length > 0 && (
        <ul className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {result.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
        </ul>
      )}

      <Card title="Días y plazos">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Row label="Días del año" value={result.days.inYear} />
          <Row label="Días en propiedad" value={result.days.owned} />
          <Row label="Días alquilados" value={result.days.rented} />
          <Row label="Días imputados" value={result.days.imputed} />
          <Row label="Proporción alquilada" value={`${(result.rentRatio * 100).toFixed(2).replace(".", ",")} %`} />
          <Row label="Cuota de participación" value={`${property.ownershipPct} %`} />
          <Row label="Referencia catastral" value={property.cadastralRef ?? "—"} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1 text-sm">
          {([["210 tipo 01", result.deadlines.rendimientos, view.status.rendimientos], ["210 tipo 02", result.deadlines.imputada, view.status.imputada]] as const).map(
            ([label, deadline, status]) =>
              deadline && status ? (
                <Badge key={label} variant="outline" className="h-auto whitespace-normal py-1">
                  {label}: {STATUS_LABEL[status.status]} · plazo {formatDateEs(deadline.from)} – {formatDateEs(deadline.to)}
                  {status.surchargePct ? ` · recargo ${status.surchargePct} %${status.interestDue ? " + intereses" : ""}` : ""}
                </Badge>
              ) : null,
          )}
        </div>
      </Card>

      {rend ? (
        <Card title="210 tipo 01 — Rendimientos del alquiler">
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Row label="Ingresos íntegros" value={formatEur(rend.grossCents)} />
            <Row label="Gastos deducibles (casilla 17)" value={formatEur(rend.boxes[17])} />
            <Row label="Base imponible" value={formatEur(rend.baseCents)} strong />
            <Row label={`Cuota (${property.taxRatePct} %)`} value={formatEur(rend.taxCents)} strong />
          </div>
        </Card>
      ) : (
        <Card title="210 tipo 01 — Rendimientos del alquiler">
          <p className="text-sm text-muted-foreground">Sin días alquilados en {year}: no corresponde el tipo 01.</p>
        </Card>
      )}

      {rend && (
        <Card title="Anexo de desglose de gastos deducibles">
          <div>
            {Array.from({ length: 17 }, (_, i) => i + 1).map((b) => (
              <BoxRow key={b} box={b} label={BOX_LABELS[b]} cents={rend.boxes[b]} lines={lines(b)} />
            ))}
          </div>
        </Card>
      )}

      {rend && (
        <Card title="Amortizaciones">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Inmueble (casilla 14)</h3>
            <Row label="Costes de adquisición" value={formatEur(result.amortization.building.acquisitionTotalCents)} />
            <Row label="Valor catastral total" value={formatEur(result.amortization.building.cadastralTotalCents)} />
            <Row label="Base de amortización (el mayor)" value={formatEur(result.amortization.building.baseCents)} />
            <Row label="Proporción de construcción" value={`${(result.amortization.building.buildingShare * 100).toFixed(2).replace(".", ",")} %`} />
            <Row label="Amortización del año (3 % × proporción alquilada)" value={formatEur(result.amortization.building.amortizationCents)} strong />
          </div>
          {([["Mobiliario y electrodomésticos (10 %)", result.amortization.furniture], ["Mejoras (3 %)", result.amortization.improvements]] as const).map(([title, items]) =>
            items.length > 0 ? (
              <div key={title} className="space-y-1">
                <h3 className="text-sm font-medium">{title}</h3>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground"><tr><th className="font-normal">Concepto</th><th className="font-normal">Fecha</th><th className="text-right font-normal">Coste</th><th className="text-right font-normal">Amortizado antes</th><th className="text-right font-normal">Cuota del año</th><th className="text-right font-normal">Pendiente</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="py-1">{info.get(i.id)?.concept ?? `#${i.id}`}</td>
                        <td>{formatDateEs(i.date)}</td>
                        <td className="text-right tabular-nums">{formatEur(i.costCents)}</td>
                        <td className="text-right tabular-nums">{formatEur(i.priorDeductedCents)}</td>
                        <td className="text-right tabular-nums">{formatEur(i.rawCents)}</td>
                        <td className="text-right tabular-nums">{formatEur(i.costCents - i.priorDeductedCents - i.rawCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null,
          )}
        </Card>
      )}

      <Card title="Arrastre de intereses y reparación (casillas 1–4)">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Row label="Generado este año" value={formatEur(result.carryforward.generated)} />
          <Row label="Aplicado este año (casillas 2 + 4)" value={formatEur(result.carryforward.applied)} />
        </div>
        {result.carryforward.pending.length > 0 ? (
          <ul className="text-sm">
            {result.carryforward.pending.map((p) => (
              <li key={p.originYear}>Pendiente de {p.originYear}: <strong>{formatEur(p.cents)}</strong> · caduca tras {p.originYear + 4}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin arrastre pendiente.</p>
        )}
        {result.carryforward.expired.map((p) => (
          <p key={p.originYear} className="text-sm text-destructive">Caducado: {formatEur(p.cents)} de {p.originYear}</p>
        ))}
      </Card>

      {imp && (
        <Card title="210 tipo 02 — Renta imputada">
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Row label="Valor catastral total" value={formatEur(imp.cadastralTotalCents)} />
            <Row label="Tipo de imputación" value={`${String(imp.ratePct).replace(".", ",")} %`} />
            <Row label="Días imputados" value={imp.days} />
            <Row label="Base imponible" value={formatEur(imp.baseCents)} strong />
            <Row label={`Cuota (${property.taxRatePct} %)`} value={formatEur(imp.taxCents)} strong />
          </div>
        </Card>
      )}

      {hasFiling && (
        <Card title="Comparativa con lo presentado">
          <Comparison view={view} />
        </Card>
      )}
    </div>
  );
}
