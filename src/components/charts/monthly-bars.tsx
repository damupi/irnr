"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true })} €`;

export function MonthlyBars({ income, expenses }: { income: number[]; expenses: number[] }) {
  const data = MONTHS.map((m, i) => ({ mes: m, Ingresos: income[i] / 100, Gastos: expenses[i] / 100 }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Ingresos y gastos por mes">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" />
          <YAxis tickFormatter={(v) => `${v}`} width={60} />
          <Tooltip formatter={(v) => eur(Number(v))} />
          <Legend />
          <Bar dataKey="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Gastos" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
