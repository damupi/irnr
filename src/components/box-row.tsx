"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formatDateEs } from "@/lib/dates";
import { formatEur } from "@/lib/money";

export interface BoxLine {
  concept: string;
  date: string | null;
  rawCents: number;
  computedCents: number;
}

export function BoxRow({ box, label, cents, lines }: { box: number; label: string; cents: number; lines: BoxLine[] }) {
  const [open, setOpen] = useState(false);
  const total = box === 17;
  return (
    <div data-testid={`box-${box}`} className={`border-b py-2 text-sm ${total ? "font-semibold" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-muted-foreground">Casilla {box}</span>
        {lines.length > 0 ? (
          <button type="button" aria-expanded={open} className="flex flex-1 items-center gap-1 text-left hover:underline" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {label} <span className="text-xs text-muted-foreground">({lines.length})</span>
          </button>
        ) : (
          <span className="flex-1 pl-5">{label}</span>
        )}
        <span className="tabular-nums">{formatEur(cents)}</span>
      </div>
      {open && (
        <table className="mt-2 ml-16 w-[calc(100%-4rem)] text-xs">
          <thead className="text-muted-foreground">
            <tr><th className="text-left font-normal">Movimiento</th><th className="text-left font-normal">Fecha</th><th className="text-right font-normal">Bruto</th><th className="text-right font-normal">Computado</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="py-1">{l.concept}</td>
                <td>{l.date ? formatDateEs(l.date) : ""}</td>
                <td className="text-right tabular-nums">{formatEur(l.rawCents)}</td>
                <td className="text-right tabular-nums">{formatEur(l.computedCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
