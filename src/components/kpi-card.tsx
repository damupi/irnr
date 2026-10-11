import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ id, label, value, hint }: { id: string; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card data-testid={`kpi-${id}`}>
      <CardContent className="space-y-1 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
