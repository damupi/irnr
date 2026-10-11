import { CategorySection, FilingSection, PropertyForm, RentalSection, YearParamsForm, type YearParamsView } from "@/components/config-forms";
import { getDb } from "@/db/client";
import { attachments, transactions } from "@/db/schema";
import { listCategories } from "@/server/categories";
import { listFilings } from "@/server/filings";
import { getProperty, getYearParams, listYearParams } from "@/server/properties";
import { listRentalPeriods } from "@/server/rentals";
import { today } from "@/server/today";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function ConfiguracionPage() {
  const db = getDb();
  const currentYear = Number(today().slice(0, 4));
  const stored = new Set(listYearParams(db).map((p) => p.year));
  const params: YearParamsView[] = [];
  for (let y = 2023; y <= currentYear + 1; y++) {
    const p = getYearParams(db, y);
    if (p) {
      params.push({
        year: y, cadastralLandCents: p.cadastralLandCents, cadastralBuildingCents: p.cadastralBuildingCents, imputationRatePct: p.imputationRatePct,
        initialCarryforwardCents: p.initialCarryforwardCents, daysImputedOverride: p.daysImputedOverride,
        deadlineFrom: p.deadlineOverride?.from ?? "", deadlineTo: p.deadlineOverride?.to ?? "", stored: stored.has(y),
      });
    }
  }

  const count = (col: typeof attachments.transactionId | typeof attachments.rentalPeriodId | typeof attachments.filingId) =>
    Object.fromEntries(
      db.select({ id: col, n: sql<number>`count(*)` }).from(attachments).where(sql`${col} is not null`).groupBy(col).all().map((r) => [r.id as number, r.n]),
    );
  const usage = Object.fromEntries(
    db.select({ id: transactions.categoryId, n: sql<number>`count(*)` }).from(transactions).where(sql`${transactions.categoryId} is not null`).groupBy(transactions.categoryId).all().map((r) => [r.id as number, r.n]),
  );

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <Section title="Inmueble"><PropertyForm property={getProperty(db)} /></Section>
      <Section title="Parámetros por año" description="Valores catastrales, tipo de imputación, arrastre inicial manual y overrides de plazo y de días imputados. Los años sin datos heredan el último anterior.">
        <div className="space-y-2">{params.map((p) => <YearParamsForm key={`${p.year}-${p.cadastralLandCents}-${p.stored}`} p={p} />)}</div>
      </Section>
      <Section title="Contratos de alquiler" description="«Generar rentas» crea las mensualidades devengadas hasta hoy que falten (idempotente).">
        <RentalSection rentals={listRentalPeriods(db)} counts={count(attachments.rentalPeriodId)} />
      </Section>
      <Section title="Declaraciones presentadas">
        <FilingSection filings={listFilings(db)} counts={count(attachments.filingId)} />
      </Section>
      <Section title="Categorías" description="No se puede borrar una categoría en uso.">
        <CategorySection categories={listCategories(db)} usage={usage} />
      </Section>
    </div>
  );
}
