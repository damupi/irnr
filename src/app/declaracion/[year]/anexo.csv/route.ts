import { getDb } from "@/db/client";
import { anexoCsv } from "@/lib/csv";
import { getTaxYear } from "@/server/taxYear";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!Number.isInteger(year)) return new Response("Ejercicio no válido", { status: 400 });
  try {
    const { result } = getTaxYear(getDb(), year, today());
    return new Response("﻿" + anexoCsv(result.rendimientos?.boxes ?? {}), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anexo-${year}.csv"` },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 400 });
  }
}
