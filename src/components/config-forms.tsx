"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AttachmentDropzone } from "@/components/attachment-dropzone";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category, FilingRow, Property, RentalPeriodRow } from "@/db/schema";
import { formatDateEs } from "@/lib/dates";
import { formatAmountEs, formatEur, parseAmountEs } from "@/lib/money";
import { treatmentBadge } from "@/lib/treatment";
import type { Treatment } from "@/lib/tax/types";
import {
  createCategoryAction, createFilingAction, createRentalAction, deleteCategoryAction, deleteFilingAction, deleteRentalAction,
  generateRentsAction, savePropertyAction, uploadAttachmentAction, upsertYearParamsAction, type ActionResult,
} from "@/server/actions";

function useRun() {
  const router = useRouter();
  return async function run<T>(p: Promise<ActionResult<T>>, message: string): Promise<ActionResult<T>> {
    const r = await p;
    if (r.ok) {
      toast.success(message);
      router.refresh();
    } else toast.error(r.error);
    return r;
  };
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

const num = (s: string) => Number(s.replace(",", "."));

async function upload(ownerType: "rentalPeriod" | "filing", ownerId: number, files: File[]) {
  if (files.length === 0) return;
  const fd = new FormData();
  fd.set("ownerType", ownerType);
  fd.set("ownerId", String(ownerId));
  files.forEach((f) => fd.append("files", f));
  const r = await uploadAttachmentAction(fd);
  if (!r.ok) toast.error(`Falló la subida: ${r.error}`);
}

function ConfirmDelete({ target, onClose, onConfirm }: { target: string | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar?</AlertDialogTitle>
          <AlertDialogDescription>{target} se borrará. No se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>Borrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ───────────────────────── Inmueble ─────────────────────────

export function PropertyForm({ property }: { property: Property | null }) {
  const run = useRun();
  const [v, setV] = useState({
    alias: property?.alias ?? "", address: property?.address ?? "", cadastralRef: property?.cadastralRef ?? "",
    acquisitionDate: property?.acquisitionDate ?? "", ownershipPct: String(property?.ownershipPct ?? 100),
    residenceCountry: property?.residenceCountry ?? "DE", taxRatePct: String(property?.taxRatePct ?? 19),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(savePropertyAction({ alias: v.alias, address: v.address || null, cadastralRef: v.cadastralRef || null, acquisitionDate: v.acquisitionDate, ownershipPct: num(v.ownershipPct), residenceCountry: v.residenceCountry, taxRatePct: num(v.taxRatePct) }), "Inmueble guardado");
      }}
    >
      <Field label="Alias" htmlFor="p-alias"><Input id="p-alias" required value={v.alias} onChange={set("alias")} /></Field>
      <Field label="Dirección" htmlFor="p-address" className="sm:col-span-2"><Input id="p-address" value={v.address} onChange={set("address")} /></Field>
      <Field label="Referencia catastral" htmlFor="p-ref"><Input id="p-ref" value={v.cadastralRef} onChange={set("cadastralRef")} /></Field>
      <Field label="Fecha de adquisición" htmlFor="p-acq"><Input id="p-acq" type="date" required value={v.acquisitionDate} onChange={set("acquisitionDate")} /></Field>
      <Field label="% titularidad" htmlFor="p-own"><Input id="p-own" inputMode="decimal" value={v.ownershipPct} onChange={set("ownershipPct")} /></Field>
      <Field label="País de residencia" htmlFor="p-country"><Input id="p-country" value={v.residenceCountry} onChange={set("residenceCountry")} /></Field>
      <Field label="Tipo de gravamen (%)" htmlFor="p-rate"><Input id="p-rate" inputMode="decimal" value={v.taxRatePct} onChange={set("taxRatePct")} /></Field>
      <div className="flex items-end"><Button type="submit">Guardar inmueble</Button></div>
    </form>
  );
}

// ───────────────────── Parámetros por año ─────────────────────

export interface YearParamsView {
  year: number;
  cadastralLandCents: number;
  cadastralBuildingCents: number;
  imputationRatePct: number;
  initialCarryforwardCents: number;
  daysImputedOverride: number | null;
  deadlineFrom: string;
  deadlineTo: string;
  stored: boolean;
}

export function YearParamsForm({ p }: { p: YearParamsView }) {
  const run = useRun();
  const [v, setV] = useState({
    land: formatAmountEs(p.cadastralLandCents), building: formatAmountEs(p.cadastralBuildingCents), rate: String(p.imputationRatePct).replace(".", ","),
    initial: formatAmountEs(p.initialCarryforwardCents), days: p.daysImputedOverride === null ? "" : String(p.daysImputedOverride),
    from: p.deadlineFrom, to: p.deadlineTo,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const y = p.year;
  return (
    <form
      className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-4 lg:grid-cols-8"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await run(
            upsertYearParamsAction({
              year: y, cadastralLandCents: parseAmountEs(v.land), cadastralBuildingCents: parseAmountEs(v.building), imputationRatePct: num(v.rate),
              initialCarryforwardCents: parseAmountEs(v.initial), daysImputedOverride: v.days === "" ? null : Number(v.days),
              deadlineOverrideFrom: v.from || null, deadlineOverrideTo: v.to || null,
            }),
            "Guardado",
          );
        } catch {
          toast.error("Importe no válido");
        }
      }}
    >
      <p className="font-semibold">{y}{!p.stored && <span className="block text-xs font-normal text-muted-foreground">heredado</span>}</p>
      <Field label={`VC suelo ${y}`} htmlFor={`vcs-${y}`}><Input id={`vcs-${y}`} inputMode="decimal" value={v.land} onChange={set("land")} /></Field>
      <Field label={`VC construcción ${y}`} htmlFor={`vcc-${y}`}><Input id={`vcc-${y}`} inputMode="decimal" value={v.building} onChange={set("building")} /></Field>
      <Field label={`Imputación % ${y}`} htmlFor={`imp-${y}`}><Input id={`imp-${y}`} inputMode="decimal" value={v.rate} onChange={set("rate")} /></Field>
      <Field label={`Arrastre inicial ${y}`} htmlFor={`ini-${y}`}><Input id={`ini-${y}`} inputMode="decimal" value={v.initial} onChange={set("initial")} /></Field>
      <Field label={`Días imputados (forzar) ${y}`} htmlFor={`dias-${y}`}><Input id={`dias-${y}`} inputMode="numeric" placeholder="auto" value={v.days} onChange={set("days")} /></Field>
      <Field label={`Plazo desde ${y}`} htmlFor={`pd-${y}`}><Input id={`pd-${y}`} type="date" value={v.from} onChange={set("from")} /></Field>
      <Field label={`Plazo hasta ${y}`} htmlFor={`ph-${y}`}>
        <div className="flex gap-2">
          <Input id={`ph-${y}`} type="date" value={v.to} onChange={set("to")} />
          <Button type="submit" aria-label={`Guardar ${y}`}>Guardar {y}</Button>
        </div>
      </Field>
    </form>
  );
}

// ───────────────────────── Contratos ─────────────────────────

export function RentalSection({ rentals, counts }: { rentals: RentalPeriodRow[]; counts: Record<number, number> }) {
  const run = useRun();
  const [toDelete, setToDelete] = useState<RentalPeriodRow | null>(null);
  const [v, setV] = useState({ tenant: "", start: "", end: "", rent: "", agency: "", notes: "" });
  const [files, setFiles] = useState<File[]>([]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Inquilino</TableHead><TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead className="text-right">Renta mensual</TableHead><TableHead>Agencia</TableHead><TableHead>Adj.</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {rentals.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.tenant}</TableCell>
              <TableCell>{formatDateEs(r.startDate)}</TableCell>
              <TableCell>{r.endDate ? formatDateEs(r.endDate) : "vigente"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatEur(r.monthlyRentCents)}</TableCell>
              <TableCell>{r.agency}</TableCell>
              <TableCell>{counts[r.id] ? `📎 ${counts[r.id]}` : ""}</TableCell>
              <TableCell className="space-x-1 whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => run(generateRentsAction(r.id), "Rentas generadas")}>Generar rentas</Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Borrar contrato ${r.tenant ?? r.id}`} onClick={() => setToDelete(r)}><Trash2 className="size-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form
        id="rental-form"
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          let rent: number;
          try { rent = parseAmountEs(v.rent); } catch { return toast.error("Renta no válida"); }
          const r = await run(createRentalAction({ tenant: v.tenant || null, startDate: v.start, endDate: v.end || null, monthlyRentCents: rent, agency: v.agency || null, notes: v.notes || null }), "Contrato añadido");
          if (r.ok) {
            await upload("rentalPeriod", (r.data as { id: number }).id, files);
            setV({ tenant: "", start: "", end: "", rent: "", agency: "", notes: "" });
            setFiles([]);
          }
        }}
      >
        <Field label="Inquilino" htmlFor="r-tenant"><Input id="r-tenant" value={v.tenant} onChange={set("tenant")} /></Field>
        <Field label="Inicio" htmlFor="r-start"><Input id="r-start" type="date" required value={v.start} onChange={set("start")} /></Field>
        <Field label="Fin" htmlFor="r-end"><Input id="r-end" type="date" value={v.end} onChange={set("end")} /></Field>
        <Field label="Renta mensual (€)" htmlFor="r-rent"><Input id="r-rent" inputMode="decimal" required value={v.rent} onChange={set("rent")} /></Field>
        <Field label="Agencia" htmlFor="r-agency"><Input id="r-agency" value={v.agency} onChange={set("agency")} /></Field>
        <Field label="Notas del contrato" htmlFor="r-notes"><Input id="r-notes" value={v.notes} onChange={set("notes")} /></Field>
        <div className="sm:col-span-3"><AttachmentDropzone staged={files} onStagedChange={setFiles} /></div>
        <div><Button type="submit">Añadir contrato</Button></div>
      </form>
      <ConfirmDelete target={toDelete ? `El contrato de ${toDelete.tenant ?? toDelete.id}` : null} onClose={() => setToDelete(null)} onConfirm={() => { const t = toDelete; setToDelete(null); if (t) run(deleteRentalAction(t.id), "Contrato borrado"); }} />
    </div>
  );
}

// ───────────────────── Declaraciones presentadas ─────────────────────

export function FilingSection({ filings, counts }: { filings: FilingRow[]; counts: Record<number, number> }) {
  const run = useRun();
  const [toDelete, setToDelete] = useState<FilingRow | null>(null);
  const empty = { year: "", type: "01", date: "", receipt: "", gross: "", expenses: "", base: "", tax: "", notes: "" };
  const [v, setV] = useState(empty);
  const [files, setFiles] = useState<File[]>([]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const cents = (s: string) => (s.trim() === "" ? 0 : parseAmountEs(s));
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Ejercicio</TableHead><TableHead>Tipo</TableHead><TableHead>Presentado</TableHead><TableHead className="text-right">Íntegros</TableHead><TableHead className="text-right">Gastos</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Cuota</TableHead><TableHead>Adj.</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {filings.map((f) => (
            <TableRow key={f.id}>
              <TableCell>{f.year}</TableCell>
              <TableCell>{f.incomeType}</TableCell>
              <TableCell>{formatDateEs(f.filedAt)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatEur(f.grossCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatEur(f.expensesCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatEur(f.baseCents)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatEur(f.taxCents)}</TableCell>
              <TableCell>{counts[f.id] ? `📎 ${counts[f.id]}` : ""}</TableCell>
              <TableCell><Button size="icon-sm" variant="ghost" aria-label={`Borrar declaración ${f.year} tipo ${f.incomeType}`} onClick={() => setToDelete(f)}><Trash2 className="size-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form
        id="filing-form"
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          let amounts;
          try { amounts = { grossCents: cents(v.gross), expensesCents: cents(v.expenses), baseCents: cents(v.base), taxCents: cents(v.tax) }; } catch { return toast.error("Importe no válido"); }
          const r = await run(createFilingAction({ year: Number(v.year), incomeType: v.type as "01" | "02", filedAt: v.date, receiptNumber: v.receipt || null, notes: v.notes || null, ...amounts }), "Declaración añadida");
          if (r.ok) {
            await upload("filing", (r.data as { id: number }).id, files);
            setV(empty);
            setFiles([]);
          }
        }}
      >
        <Field label="Ejercicio declaración" htmlFor="f-year"><Input id="f-year" inputMode="numeric" required value={v.year} onChange={set("year")} /></Field>
        <Field label="Tipo de renta" htmlFor="f-type">
          <NativeSelect id="f-type" value={v.type} onChange={set("type")}>
            <option value="01">01 · Rendimientos</option>
            <option value="02">02 · Renta imputada</option>
          </NativeSelect>
        </Field>
        <Field label="Fecha de presentación" htmlFor="f-date"><Input id="f-date" type="date" required value={v.date} onChange={set("date")} /></Field>
        <Field label="Nº de justificante" htmlFor="f-receipt"><Input id="f-receipt" value={v.receipt} onChange={set("receipt")} /></Field>
        <Field label="Íntegros (€)" htmlFor="f-gross"><Input id="f-gross" inputMode="decimal" value={v.gross} onChange={set("gross")} /></Field>
        <Field label="Gastos (€)" htmlFor="f-exp"><Input id="f-exp" inputMode="decimal" value={v.expenses} onChange={set("expenses")} /></Field>
        <Field label="Base (€)" htmlFor="f-base"><Input id="f-base" inputMode="decimal" value={v.base} onChange={set("base")} /></Field>
        <Field label="Cuota (€)" htmlFor="f-tax"><Input id="f-tax" inputMode="decimal" value={v.tax} onChange={set("tax")} /></Field>
        <div className="sm:col-span-4"><AttachmentDropzone staged={files} onStagedChange={setFiles} /></div>
        <div><Button type="submit">Añadir declaración</Button></div>
      </form>
      <ConfirmDelete target={toDelete ? `La declaración ${toDelete.year} tipo ${toDelete.incomeType}` : null} onClose={() => setToDelete(null)} onConfirm={() => { const t = toDelete; setToDelete(null); if (t) run(deleteFilingAction(t.id), "Declaración borrada"); }} />
    </div>
  );
}

// ───────────────────────── Categorías ─────────────────────────

const TREATMENT_OPTIONS: [Treatment, string][] = [
  ["income", "Ingreso"], ["non_taxable_income", "Ingreso no computable"], ["capped_1_4", "Límite casillas 1–4"], ["deductible", "Deducible (casilla)"],
  ["acquisition_cost", "Coste de adquisición"], ["furniture_10", "Mobiliario 10 %"], ["improvement_3", "Mejora 3 %"], ["non_deductible", "No deducible"],
];

export function CategorySection({ categories, usage }: { categories: Category[]; usage: Record<number, number> }) {
  const run = useRun();
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const empty = { cat1: "", cat2: "", treatment: "deductible", box: "", prorate: false, help: "" };
  const [v, setV] = useState(empty);
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Categoría</TableHead><TableHead>Tratamiento</TableHead><TableHead>Casilla</TableHead><TableHead>Prorratea</TableHead><TableHead>Usos</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.cat1} / {c.cat2}</TableCell>
              <TableCell>{treatmentBadge(c).label}</TableCell>
              <TableCell>{c.box ?? ""}</TableCell>
              <TableCell>{c.prorate ? "Sí" : "No"}</TableCell>
              <TableCell>{usage[c.id] ?? 0}</TableCell>
              <TableCell><Button size="icon-sm" variant="ghost" aria-label={`Borrar ${c.cat1} / ${c.cat2}`} onClick={() => setToDelete(c)}><Trash2 className="size-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form
        className="grid gap-3 sm:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(createCategoryAction({ cat1: v.cat1, cat2: v.cat2, treatment: v.treatment as Treatment, box: v.box ? Number(v.box) : null, prorate: v.prorate, help: v.help || null }), "Categoría añadida");
          if (r.ok) setV(empty);
        }}
      >
        <Field label="Categoría 1" htmlFor="c-cat1"><Input id="c-cat1" required value={v.cat1} onChange={(e) => setV({ ...v, cat1: e.target.value })} /></Field>
        <Field label="Categoría 2" htmlFor="c-cat2"><Input id="c-cat2" required value={v.cat2} onChange={(e) => setV({ ...v, cat2: e.target.value })} /></Field>
        <Field label="Tratamiento" htmlFor="c-treat">
          <NativeSelect id="c-treat" value={v.treatment} onChange={(e) => setV({ ...v, treatment: e.target.value })}>
            {TREATMENT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Casilla" htmlFor="c-box"><Input id="c-box" inputMode="numeric" placeholder="1–17" value={v.box} onChange={(e) => setV({ ...v, box: e.target.value })} /></Field>
        <div className="flex items-center gap-2 pt-6">
          <input id="c-prorate" type="checkbox" className="size-4" checked={v.prorate} onChange={(e) => setV({ ...v, prorate: e.target.checked })} />
          <Label htmlFor="c-prorate">Prorratea por días alquilados</Label>
        </div>
        <Field label="Ayuda" htmlFor="c-help" className="sm:col-span-2"><Input id="c-help" value={v.help} onChange={(e) => setV({ ...v, help: e.target.value })} /></Field>
        <div className="flex items-end"><Button type="submit">Añadir categoría</Button></div>
      </form>
      <ConfirmDelete target={toDelete ? `La categoría ${toDelete.cat1} / ${toDelete.cat2}` : null} onClose={() => setToDelete(null)} onConfirm={() => { const t = toDelete; setToDelete(null); if (t) run(deleteCategoryAction(t.id), "Categoría borrada"); }} />
    </div>
  );
}
