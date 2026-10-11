"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function BoxesBars({ data }: { data: { casilla: string; importe: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">Sin gastos deducibles.</p>;
  return (
    <div className="w-full" style={{ height: 28 * data.length + 40 }} role="img" aria-label="Gastos deducibles por casilla">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" />
          <YAxis type="category" dataKey="casilla" width={90} />
          <Tooltip formatter={(v) => eur(Number(v))} />
          <Bar dataKey="importe" fill="#38bdf8" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
