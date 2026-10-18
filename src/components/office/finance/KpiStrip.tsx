"use client";

import { StatCard } from "./ui";

// 4-card KPI strip — all-time honest numbers:
//   Received (emerald)  = finance report income
//   Expenses (red)      = case expenses + office expenses
//   Wasool (sky)        = members ko ab tak pay kiya
//   Due (amber)         = members ka abhi baaqi
export default function KpiStrip({
  received,
  expenses,
  wasool,
  due,
}: {
  received: number;
  expenses: number;
  wasool: number;
  due: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCard label="Total received" value={received} tone="emerald" hint="Tamam received payments" />
      <StatCard label="Total expenses" value={expenses} tone="red" hint="Admin-borne case + office + company expenses" />
      <StatCard label="Total wasool" value={wasool} tone="sky" hint="Members ko paid out" />
      <StatCard label="Total due" value={due} tone="amber" hint="Members ka baaqi" />
    </div>
  );
}
