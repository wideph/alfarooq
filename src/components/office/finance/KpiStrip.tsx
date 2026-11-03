"use client";

import { StatCard } from "./ui";

// KPI strip — all-time honest numbers:
//   Received (emerald)  = finance report income
//   Expenses (red)      = case expenses + office expenses
//   Wasool (sky)        = members ko ab tak pay kiya
//   Due (amber)         = members ka abhi baaqi
//   §W51 Payable expenses (amber) = department users ke kharche (courier +
//   other) jo admin ne wapas dene hain — click par neeche wala section.
export default function KpiStrip({
  received,
  expenses,
  wasool,
  due,
  payableExpenses,
}: {
  received: number;
  expenses: number;
  wasool: number;
  due: number;
  payableExpenses: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <StatCard label="Total received" value={received} tone="emerald" hint="Tamam received payments" />
      <StatCard label="Total expenses" value={expenses} tone="red" hint="Admin-borne case + office + company expenses" />
      <StatCard label="Total wasool" value={wasool} tone="sky" hint="Members ko paid out" />
      <StatCard label="Total due" value={due} tone="amber" hint="Members ka baaqi" />
      <a
        href="#dept-expenses"
        className="col-span-2 block rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-200 lg:col-span-1"
      >
        <StatCard
          label="Payable expenses"
          value={payableExpenses}
          tone={payableExpenses > 0 ? "amber" : "slate"}
          hint="Department users ke kharche (courier + other) — wapas dene hain"
        />
      </a>
    </div>
  );
}
