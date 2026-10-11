import type { Deadline, Filing } from "./types";

/** Plazos del 210 según PRD §5.6. El override del ejercicio tiene prioridad. */
export function deadlineFor(input: {
  year: number;
  incomeType: "01" | "02";
  resultIsZero: boolean;
  override?: Deadline | null;
}): Deadline {
  if (input.override) return input.override;
  const next = input.year + 1;
  const aprilRegime = input.year >= 2026;
  if (input.incomeType === "02") {
    return { from: `${next}-${aprilRegime ? "04" : "01"}-01`, to: `${next}-12-31` };
  }
  if (input.resultIsZero || !aprilRegime) return { from: `${next}-01-01`, to: `${next}-01-20` };
  return { from: `${next}-04-01`, to: `${next}-04-20` };
}

export type FilingStatus = "filed" | "filed_late" | "pending" | "overdue" | "future";

export interface FilingStatusResult {
  status: FilingStatus;
  surchargePct?: number;
  interestDue?: boolean;
}

/** Meses completos transcurridos desde `from` hasta `to` (ISO). */
function completeMonths(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

export function filingStatus(input: { deadline: Deadline; filing: Filing | null; today: string }): FilingStatusResult {
  const { deadline, filing, today } = input;
  if (filing) return { status: filing.filedAt <= deadline.to ? "filed" : "filed_late" };
  if (today < deadline.from) return { status: "future" };
  if (today <= deadline.to) return { status: "pending" };
  const months = completeMonths(deadline.to, today);
  // Art. 27 LGT: 1 % + 1 % por mes completo; más de 12 meses → 15 % + intereses de demora.
  return months > 12
    ? { status: "overdue", surchargePct: 15, interestDue: true }
    : { status: "overdue", surchargePct: 1 + months, interestDue: false };
}
