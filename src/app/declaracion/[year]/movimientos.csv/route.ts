import { getDb } from "@/db/client";
import { transactionsCsv } from "@/lib/csv";
import { listTransactions } from "@/server/transactions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!Number.isInteger(year)) return new Response("Ejercicio no válido", { status: 400 });
  const { rows } = listTransactions(getDb(), { year, sort: "date", dir: "asc" });
  const csv = transactionsCsv(rows.map((r) => ({ ...r, cat1: r.category?.cat1 ?? null, cat2: r.category?.cat2 ?? null })));
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="movimientos-${year}.csv"` },
  });
}
