import type { Treatment } from "./tax/types";

export type BadgeTone = "deductible" | "capped" | "asset" | "income" | "neutral" | "pending";

interface CategoryLike {
  cat2: string;
  treatment: Treatment;
  box: number | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Etiqueta del tratamiento fiscal de una categoría (PRD §4.2). */
export function treatmentBadge(category: (CategoryLike & Record<string, unknown>) | null): { label: string; tone: BadgeTone } {
  if (!category) return { label: "Pendiente", tone: "pending" };
  switch (category.treatment) {
    case "deductible":
      return { label: `${category.box ? `Casilla ${category.box}` : "Deducible"} · ${cap(category.cat2)}`, tone: "deductible" };
    case "capped_1_4":
      return { label: "Límite 1–4", tone: "capped" };
    case "furniture_10":
      return { label: "Amortizable 10 %", tone: "asset" };
    case "improvement_3":
      return { label: "Amortizable 3 %", tone: "asset" };
    case "acquisition_cost":
      return { label: "Coste adquisición", tone: "asset" };
    case "income":
      return { label: "Ingreso", tone: "income" };
    case "non_taxable_income":
      return { label: "No computa", tone: "neutral" };
    case "non_deductible":
      return { label: "No deducible", tone: "neutral" };
  }
}
