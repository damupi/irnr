import { Suspense } from "react";
import { LedgerTable } from "@/components/ledger-table";
import { getDb } from "@/db/client";
import { listCategories } from "@/server/categories";
import { today } from "@/server/today";
import { listTransactions } from "@/server/transactions";
import { defaultYear, parseYear } from "@/server/year";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const db = getDb();
  const now = today();
  const year = parseYear(sp.year, defaultYear(db, now));
  const sort = one(sp.sort) === "amount" ? "amount" : "date";
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const kind = one(sp.kind);
  const { rows, totals } = listTransactions(db, {
    year,
    kind: kind === "expense" || kind === "income" ? kind : undefined,
    cat1: one(sp.cat1) || undefined,
    cat2: one(sp.cat2) || undefined,
    uncategorized: one(sp.uncategorized) === "1",
    noAttachment: one(sp.noAttachment) === "1",
    noInvoice: one(sp.noInvoice) === "1",
    q: one(sp.q) || undefined,
    sort,
    dir,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Movimientos · {year}</h1>
      <Suspense>
        <LedgerTable rows={rows} totals={totals} categories={listCategories(db)} year={year} defaultDate={now.startsWith(String(year)) ? now : `${year}-01-01`} sort={sort} dir={dir} />
      </Suspense>
    </div>
  );
}
