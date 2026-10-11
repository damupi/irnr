"use server";

import { revalidatePath } from "next/cache";
import { dataDir, getDb } from "@/db/client";
import { parseAmountEs } from "@/lib/money";
import { deleteAttachment, listAttachments, saveAttachment, type OwnerType } from "./attachments";
import { createCategory, deleteCategory, updateCategory, type CategoryInput } from "./categories";
import { createFiling, deleteFiling, updateFiling, type FilingInput } from "./filings";
import { saveProperty, upsertYearParams, type YearParamsInput } from "./properties";
import { createRentalPeriod, deleteRentalPeriod, generateIncomeFromRental, updateRentalPeriod, type RentalInput } from "./rentals";
import {
  createTransaction, deleteTransaction, duplicateTransaction, generateRecurring, updateTransaction, type TransactionInput,
} from "./transactions";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const today = () => process.env.IRNR_TODAY ?? new Date().toISOString().slice(0, 10);

async function run<T>(fn: () => T | Promise<T>, revalidate = true): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Convierte un importe escrito por el usuario ("1.234,56" o "1234.56") a céntimos. */
export async function parseAmountAction(text: string): Promise<ActionResult<number>> {
  return run(() => parseAmountEs(text), false);
}

export async function createTransactionAction(input: TransactionInput) {
  return run(() => createTransaction(getDb(), input));
}
export async function updateTransactionAction(id: number, input: Partial<TransactionInput>) {
  return run(() => updateTransaction(getDb(), id, input));
}
export async function deleteTransactionAction(id: number) {
  return run(() => deleteTransaction(getDb(), id, dataDir()));
}
export async function duplicateTransactionAction(id: number) {
  return run(() => duplicateTransaction(getDb(), id, today()));
}
export async function generateRecurringAction(id: number, every: "month" | "quarter" | "year", count: number) {
  return run(() => generateRecurring(getDb(), id, { every, count }).length);
}

export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult<number>> {
  return run(async () => {
    const ownerType = String(formData.get("ownerType")) as OwnerType;
    const ownerId = Number(formData.get("ownerId"));
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    for (const f of files) {
      const bytes = Buffer.from(await f.arrayBuffer());
      saveAttachment(getDb(), { ownerType, ownerId, file: { name: f.name, type: f.type, bytes } }, dataDir());
    }
    return files.length;
  });
}
export async function deleteAttachmentAction(id: number) {
  return run(() => deleteAttachment(getDb(), id, dataDir()));
}

export async function createCategoryAction(input: CategoryInput) {
  return run(() => createCategory(getDb(), input));
}
export async function updateCategoryAction(id: number, input: Partial<CategoryInput>) {
  return run(() => updateCategory(getDb(), id, input));
}
export async function deleteCategoryAction(id: number) {
  return run(() => deleteCategory(getDb(), id));
}

export async function savePropertyAction(input: Parameters<typeof saveProperty>[1]) {
  return run(() => saveProperty(getDb(), input));
}
export async function upsertYearParamsAction(input: YearParamsInput) {
  return run(() => upsertYearParams(getDb(), input));
}

export async function createRentalAction(input: RentalInput) {
  return run(() => createRentalPeriod(getDb(), input));
}
export async function updateRentalAction(id: number, input: Partial<RentalInput>) {
  return run(() => updateRentalPeriod(getDb(), id, input));
}
export async function deleteRentalAction(id: number) {
  return run(() => deleteRentalPeriod(getDb(), id));
}
export async function generateRentsAction(id: number) {
  return run(() => generateIncomeFromRental(getDb(), id, { until: today() }));
}

export async function createFilingAction(input: FilingInput) {
  return run(() => createFiling(getDb(), input));
}
export async function updateFilingAction(id: number, input: Partial<FilingInput>) {
  return run(() => updateFiling(getDb(), id, input));
}
export async function deleteFilingAction(id: number) {
  return run(() => deleteFiling(getDb(), id));
}

export async function listAttachmentsAction(ownerType: OwnerType, ownerId: number) {
  return run(
    () => listAttachments(getDb(), { ownerType, ownerId }).map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size })),
    false,
  );
}
