import { Badge } from "@/components/ui/badge";
import { treatmentBadge, type BadgeTone } from "@/lib/treatment";
import { cn } from "@/lib/utils";

const TONES: Record<BadgeTone, string> = {
  deductible: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  capped: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  asset: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  income: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  neutral: "bg-muted text-muted-foreground",
  pending: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

export function TreatmentBadge({ category }: { category: Parameters<typeof treatmentBadge>[0] }) {
  const { label, tone } = treatmentBadge(category);
  return <Badge variant="secondary" className={cn("whitespace-nowrap", TONES[tone])}>{label}</Badge>;
}
