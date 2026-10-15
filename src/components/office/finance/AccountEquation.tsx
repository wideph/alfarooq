"use client";

import { formatMoney } from "@/lib/office/client";
import { dueToneClass } from "./ui";
import type { MemberSummary } from "./types";

// One clean equation — Earning − Expense share − Wasool = Due — har row apni
// line par. UserDrawer aur booking-office "Mera account" dono use karte hain.
export default function AccountEquation({ summary }: { summary: MemberSummary }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <EquationRow sign="+" label="Earning" value={summary.earning} valueClass="text-emerald-700" />
      <EquationRow sign="−" label="Expense deductions" value={summary.expenseShare} valueClass="text-red-600" />
      <EquationRow sign="−" label="Wasool (paid out)" value={summary.wasool} valueClass="text-sky-700" />
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2.5">
        <span className="text-sm font-bold text-slate-900">= Due (abhi dena hai)</span>
        <span className={`text-lg font-bold ${dueToneClass(summary.due)}`}>{formatMoney(summary.due)}</span>
      </div>
    </div>
  );
}

function EquationRow({
  sign,
  label,
  value,
  valueClass,
}: {
  sign: "+" | "−";
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`grid h-5 w-5 place-items-center rounded-md text-xs font-bold ${sign === "+" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
          {sign}
        </span>
        {label}
      </span>
      <span className={`font-semibold ${valueClass}`}>{formatMoney(value)}</span>
    </div>
  );
}
