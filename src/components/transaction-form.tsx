"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AttachmentDropzone, type ExistingAttachment } from "@/components/attachment-dropzone";
import { TreatmentBadge } from "@/components/treatment-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/db/schema";
import { formatAmountEs, parseAmountEs } from "@/lib/money";
import {
  createTransactionAction, deleteAttachmentAction, listAttachmentsAction, updateTransactionAction, uploadAttachmentAction,
} from "@/server/actions";
import type { TransactionRow } from "@/server/transactions";

export function TransactionFormSheet({
  open, onOpenChange, editing, categories, defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TransactionRow | null;
  categories: Category[];
  defaultDate: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{editing ? "Editar movimiento" : "Nuevo movimiento"}</SheetTitle>
          <SheetDescription>Los importes aceptan 1.234,56 o 1234.56.</SheetDescription>
        </SheetHeader>
        {open && <Form key={editing?.id ?? "new"} editing={editing} categories={categories} defaultDate={defaultDate} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Form({ editing, categories, defaultDate, onDone }: { editing: TransactionRow | null; categories: Category[]; defaultDate: string; onDone: () => void }) {
  const router = useRouter();
  const initialCat = categories.find((c) => c.id === editing?.categoryId);
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [kind, setKind] = useState<"expense" | "income">(editing?.kind ?? "expense");
  const [amount, setAmount] = useState(editing ? formatAmountEs(editing.amountCents) : "");
  const [payee, setPayee] = useState(editing?.payee ?? "");
  const [concept, setConcept] = useState(editing?.concept ?? "");
  const [cat1, setCat1] = useState(initialCat?.cat1 ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(initialCat?.id ?? null);
  const [hasInvoice, setHasInvoice] = useState(editing?.hasInvoice ?? false);
  const [frequency, setFrequency] = useState(editing?.frequency ?? "unica");
  const [allocation, setAllocation] = useState(String(editing?.allocationPct ?? 100));
  const [override, setOverride] = useState(editing?.taxYearOverride ? String(editing.taxYearOverride) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [staged, setStaged] = useState<File[]>([]);
  const [existing, setExisting] = useState<ExistingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    listAttachmentsAction("transaction", editing.id).then((r) => r.ok && setExisting(r.data));
  }, [editing]);

  const cat1s = useMemo(() => [...new Set(categories.map((c) => c.cat1))], [categories]);
  const cat2s = categories.filter((c) => c.cat1 === cat1);
  const category = categories.find((c) => c.id === categoryId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let amountCents: number;
    try {
      amountCents = parseAmountEs(amount);
    } catch {
      return setError("Importe no válido");
    }
    const alloc = Number(allocation.replace(",", "."));
    const input = {
      date, kind, amountCents, payee: payee || null, concept, categoryId, hasInvoice, frequency,
      allocationPct: alloc, taxYearOverride: override ? Number(override) : null, notes: notes || null,
    };
    setSaving(true);
    const res = editing ? await updateTransactionAction(editing.id, input) : await createTransactionAction(input);
    if (!res.ok) {
      setSaving(false);
      return setError(res.error);
    }
    if (staged.length) {
      const fd = new FormData();
      fd.set("ownerType", "transaction");
      fd.set("ownerId", String(editing?.id ?? (res.data as { id: number }).id));
      staged.forEach((f) => fd.append("files", f));
      const up = await uploadAttachmentAction(fd);
      if (!up.ok) toast.error(`Movimiento guardado, pero falló la subida: ${up.error}`);
    }
    setSaving(false);
    toast.success("Movimiento guardado");
    onDone();
    router.refresh();
  }

  async function deleteExisting(id: number) {
    const r = await deleteAttachmentAction(id);
    if (r.ok) {
      setExisting((list) => list.filter((a) => a.id !== id));
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="tx-date"><Input id="tx-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Tipo" htmlFor="tx-kind">
          <NativeSelect id="tx-kind" value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Importe" htmlFor="tx-amount"><Input id="tx-amount" inputMode="decimal" required placeholder="1.234,56" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Beneficiario / pagador" htmlFor="tx-payee"><Input id="tx-payee" value={payee} onChange={(e) => setPayee(e.target.value)} /></Field>
      <Field label="Concepto" htmlFor="tx-concept"><Input id="tx-concept" required value={concept} onChange={(e) => setConcept(e.target.value)} /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría 1" htmlFor="tx-cat1">
          <NativeSelect id="tx-cat1" value={cat1} onChange={(e) => { setCat1(e.target.value); setCategoryId(null); }}>
            <option value="">— sin categoría —</option>
            {cat1s.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Categoría 2" htmlFor="tx-cat2">
          <NativeSelect id="tx-cat2" value={category?.cat2 ?? ""} disabled={!cat1} onChange={(e) => setCategoryId(cat2s.find((c) => c.cat2 === e.target.value)?.id ?? null)}>
            <option value="">—</option>
            {cat2s.map((c) => <option key={c.id} value={c.cat2}>{c.cat2}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {category && (
        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" data-testid="category-help">
          <TreatmentBadge category={category} />
          {category.help && <p className="text-muted-foreground">{category.help}</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input id="tx-invoice" type="checkbox" className="size-4" checked={hasInvoice} onChange={(e) => setHasInvoice(e.target.checked)} />
        <Label htmlFor="tx-invoice">Factura</Label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Frecuencia" htmlFor="tx-freq">
          <NativeSelect id="tx-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
            <option value="unica">Única</option>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </NativeSelect>
        </Field>
        <Field label="% afectación" htmlFor="tx-alloc"><Input id="tx-alloc" inputMode="decimal" value={allocation} onChange={(e) => setAllocation(e.target.value)} /></Field>
        <Field label="Ejercicio fiscal" htmlFor="tx-override"><Input id="tx-override" inputMode="numeric" placeholder="auto" value={override} onChange={(e) => setOverride(e.target.value)} /></Field>
      </div>
      <Field label="Notas" htmlFor="tx-notes"><Textarea id="tx-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      <div className="space-y-1.5">
        <Label>Adjuntos</Label>
        <AttachmentDropzone staged={staged} onStagedChange={setStaged} existing={existing} onDeleteExisting={deleteExisting} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <SheetFooter className="mt-auto flex-row justify-end gap-2 p-0">
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={saving}>Guardar</Button>
      </SheetFooter>
    </form>
  );
}
