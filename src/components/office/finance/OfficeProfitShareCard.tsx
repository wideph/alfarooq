"use client";

import { formatMoney } from "@/lib/office/client";
import type { MemberOfficeProfit } from "./types";

// §W40 — partner (PROFIT_SHARE) office member ka hisaab owner ke formula se:
//   Office profit = received − office − case − department − other expenses
//   Aap ka hissa  = office profit × aap ki %
// Neeche account (earning − office expense share) — dono barabar hon to sahi.
export default function OfficeProfitShareCard({ data }: { data: MemberOfficeProfit }) {
  const lines: Array<{ label: string; value: number }> = [
    { label: "Office expenses", value: data.officeExpenses },
    { label: "Case expenses", value: data.caseExpenses },
    { label: "Department expenses", value: data.deptCommissions },
    { label: "Other expenses", value: data.otherExpenses },
  ];
  const matches = Math.abs(data.account - data.share) <= 0.5;
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-bold text-slate-900">Office profit ka hisaab</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">Total payment received</span>
        <span className="font-semibold text-emerald-700">{formatMoney(data.received)}</span>
      </div>
      {lines.map((line) => (
        <div key={line.label} className="flex items-center justify-between text-sm">
          <span className="text-slate-600">− {line.label}</span>
          <span className={`font-semibold ${line.value === 0 ? "text-slate-400" : "text-red-600"}`}>
            {formatMoney(line.value)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
        <span className="font-bold text-slate-900">= Office profit</span>
        <span className="font-bold text-slate-900">{formatMoney(data.officeProfit)}</span>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
        <span className="font-bold text-emerald-800">Aap ka hissa ({data.percent}%)</span>
        <span className="text-base font-bold text-emerald-800">{formatMoney(data.share)}</span>
      </div>
      <p className={`text-[11px] ${matches ? "text-slate-400" : "font-semibold text-red-600"}`}>
        {matches
          ? "Aap ke account ki earning − office expense share isi ke barabar hai."
          : `Account mein ${formatMoney(data.account)} hai — admin se rabta karein.`}
      </p>
    </div>
  );
}
