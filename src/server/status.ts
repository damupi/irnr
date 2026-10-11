import type { FilingStatus } from "@/lib/tax/deadlines";

export const STATUS_LABEL: Record<FilingStatus, string> = {
  filed: "Presentado",
  filed_late: "Presentado fuera de plazo",
  pending: "Pendiente",
  overdue: "Vencido",
  future: "Futuro",
};
