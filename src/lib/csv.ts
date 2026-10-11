import { BOX_LABELS } from "./boxes";
import { formatDateEs } from "./dates";

const plain = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function csvEscape(value: string | null): string {
  if (value === null) return "";
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV con separador `;` y decimales con coma (abre bien en Excel es-ES). */
export function anexoCsv(boxes: Record<number, number>): string {
  const lines = ["casilla;concepto;importe"];
  for (let i = 1; i <= 17; i++) lines.push(`${i};${csvEscape(BOX_LABELS[i])};${plain(boxes[i] ?? 0)}`);
  return lines.join("\n") + "\n";
}

export interface CsvTransaction {
  date: string;
  kind: "expense" | "income";
  amountCents: number;
  payee: string | null;
  concept: string;
  cat1: string | null;
  cat2: string | null;
  hasInvoice: boolean;
  frequency: string;
  attachmentCount: number;
}

export function transactionsCsv(rows: CsvTransaction[]): string {
  const lines = ["fecha;tipo;importe;beneficiario;concepto;cat1;cat2;factura;frecuencia;adjuntos"];
  for (const r of rows) {
    lines.push(
      [
        formatDateEs(r.date),
        r.kind === "income" ? "ingreso" : "gasto",
        plain(r.amountCents),
        csvEscape(r.payee),
        csvEscape(r.concept),
        csvEscape(r.cat1),
        csvEscape(r.cat2),
        r.hasInvoice ? "sí" : "no",
        r.frequency,
        r.attachmentCount,
      ].join(";"),
    );
  }
  return lines.join("\n") + "\n";
}
