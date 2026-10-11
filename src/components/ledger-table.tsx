"use client";

import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TransactionFormSheet } from "@/components/transaction-form";
import { TreatmentBadge } from "@/components/treatment-badge";
import {
  AlertDialog, AlertDialogCancel, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category } from "@/db/schema";
import { formatDateEs } from "@/lib/dates";
import { formatEur } from "@/lib/money";
import {
  deleteTransactionAction, duplicateTransactionAction, generateRecurringAction, updateTransactionAction,
} from "@/server/actions";
import type { TransactionRow } from "@/server/transactions";

interface Props {
  rows: TransactionRow[];
  totals: { incomeCents: number; expenseCents: number; count: number };
  categories: Category[];
  year: number;
  defaultDate: string;
  sort: "date" | "amount";
  dir: "asc" | "desc";
}

/** Casilla de filtro con estado local optimista (la URL se actualiza de forma asíncrona). */
function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(checked);
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" className="size-4" checked={on} onChange={(e) => { setOn(e.target.checked); onChange(e.target.checked); }} />
      {label}
    </label>
  );
}

export function LedgerTable({ rows, totals, categories, year, defaultDate, sort, dir }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [toDelete, setToDelete] = useState<TransactionRow | null>(null);
  const [recurring, setRecurring] = useState<TransactionRow | null>(null);
  const [every, setEvery] = useState<"month" | "quarter" | "year">("month");
  const [count, setCount] = useState("3");

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  };
  const cat1s = [...new Set(categories.map((c) => c.cat1))];
  const cat1 = search.get("cat1") ?? "";
  const toggleSort = (key: "date" | "amount") => {
    const params = new URLSearchParams(search.toString());
    params.set("sort", key);
    params.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    router.replace(`${pathname}?${params.toString()}`);
  };
  const SortIcon = ({ k }: { k: "date" | "amount" }) => (sort === k ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null);

  async function act<T>(p: Promise<{ ok: true; data: T } | { ok: false; error: string }>, ok: string) {
    const r = await p;
    if (r.ok) {
      toast.success(ok);
      router.refresh();
    } else toast.error(r.error);
    return r.ok;
  }

  const checkbox = (key: string, label: string) => (
    <FilterCheckbox key={key} label={label} checked={search.get(key) === "1"} onChange={(on) => setParam(key, on ? "1" : null)} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label htmlFor="f-q" className="text-xs text-muted-foreground">Buscar</Label>
          <Input id="f-q" defaultValue={search.get("q") ?? ""} placeholder="concepto, beneficiario, notas" onKeyDown={(e) => e.key === "Enter" && setParam("q", e.currentTarget.value)} onBlur={(e) => e.currentTarget.value !== (search.get("q") ?? "") && setParam("q", e.currentTarget.value)} />
        </div>
        <NativeSelect aria-label="Filtrar tipo" className="w-32" value={search.get("kind") ?? ""} onChange={(e) => setParam("kind", e.target.value)}>
          <option value="">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </NativeSelect>
        <NativeSelect aria-label="Filtrar cat1" className="w-40" value={cat1} onChange={(e) => { setParam("cat2", null); setParam("cat1", e.target.value); }}>
          <option value="">cat1: todas</option>
          {cat1s.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filtrar cat2" className="w-48" disabled={!cat1} value={search.get("cat2") ?? ""} onChange={(e) => setParam("cat2", e.target.value)}>
          <option value="">cat2: todas</option>
          {categories.filter((c) => c.cat1 === cat1).map((c) => <option key={c.id} value={c.cat2}>{c.cat2}</option>)}
        </NativeSelect>
        {checkbox("uncategorized", "Sin categoría")}
        {checkbox("noAttachment", "Sin adjunto")}
        {checkbox("noInvoice", "Sin factura")}
        <Button className="ml-auto" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus /> Nuevo movimiento</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><button className="inline-flex items-center gap-1" onClick={() => toggleSort("date")}>Fecha <SortIcon k="date" /></button></TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right"><button className="inline-flex items-center gap-1" onClick={() => toggleSort("amount")}>Importe <SortIcon k="amount" /></button></TableHead>
            <TableHead>Beneficiario</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead>Frecuencia</TableHead>
            <TableHead>Adj.</TableHead>
            <TableHead>Tratamiento</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{formatDateEs(r.date)}</TableCell>
              <TableCell>{r.kind === "income" ? "Ingreso" : "Gasto"}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.kind === "income" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{formatEur(r.amountCents)}</TableCell>
              <TableCell className="max-w-32 truncate">{r.payee}</TableCell>
              <TableCell className="max-w-56 truncate" title={r.concept}>{r.concept}</TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={`Categoría de ${r.concept}`}
                  className="h-8 w-52"
                  value={r.categoryId ?? ""}
                  onChange={(e) => act(updateTransactionAction(r.id, { categoryId: e.target.value ? Number(e.target.value) : null }), "Categoría actualizada")}
                >
                  <option value="">— pendiente —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.cat1} / {c.cat2}</option>)}
                </NativeSelect>
              </TableCell>
              <TableCell>{r.hasInvoice ? "Sí" : "No"}</TableCell>
              <TableCell>{r.frequency}</TableCell>
              <TableCell>{r.attachmentCount > 0 ? `📎 ${r.attachmentCount}` : ""}</TableCell>
              <TableCell><TreatmentBadge category={r.category} /></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent" aria-label={`Acciones de ${r.concept}`}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil /> Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => act(duplicateTransactionAction(r.id), "Movimiento duplicado con la fecha de hoy")}><Copy /> Duplicar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRecurring(r)}><Repeat /> Generar recurrentes</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => setToDelete(r)}><Trash2 /> Borrar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">No hay movimientos con estos filtros.</TableCell></TableRow>
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={11} className="text-sm">
              <span className="mr-6">{totals.count} movimientos</span>
              <span className="mr-6">Ingresos: <strong>{formatEur(totals.incomeCents)}</strong></span>
              <span>Gastos: <strong>{formatEur(totals.expenseCents)}</strong></span>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <TransactionFormSheet open={formOpen} onOpenChange={setFormOpen} editing={editing} categories={categories} defaultDate={defaultDate || `${year}-01-01`} />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.concept}» ({toDelete ? formatEur(toDelete.amountCents) : ""}) se borrará junto con sus adjuntos. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => { const t = toDelete; setToDelete(null); if (t) await act(deleteTransactionAction(t.id), "Movimiento borrado"); }}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={recurring !== null} onOpenChange={(o) => !o && setRecurring(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generar recurrentes</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Copias de «{recurring?.concept}» a partir del {recurring ? formatDateEs(recurring.date) : ""}.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-every">Periodicidad</Label>
              <NativeSelect id="rec-every" value={every} onChange={(e) => setEvery(e.target.value as typeof every)}>
                <option value="month">Mensual</option>
                <option value="quarter">Trimestral</option>
                <option value="year">Anual</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-count">Repeticiones</Label>
              <Input id="rec-count" type="number" min={1} max={120} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecurring(null)}>Cancelar</Button>
            <Button onClick={async () => { const t = recurring; setRecurring(null); if (t) await act(generateRecurringAction(t.id, every, Number(count)), "Recurrentes generados"); }}>Generar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
