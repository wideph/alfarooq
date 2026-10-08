"use client";

import { useCallback, useEffect, useState } from "react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { BOOKING_OFFICE_TYPE_LABELS, type BookingOfficeType } from "@/lib/office/permissions";

type Report = {
  from: string;
  to: string;
  summary: {
    income: number;
    commissions: number;
    caseExpenses: number;
    salaries: number;
    otherExpenses: number;
    profit: number;
    liabilities: number;
    paymentsCount: number;
  };
  days: Array<{ date: string; income: number; commissions: number; caseExpenses: number; salaries: number; otherExpenses: number; profit: number }>;
  offices: Array<{ id: string; name: string; type: BookingOfficeType; income: number; commissions: number; salaries: number }>;
};

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export default function OfficeFinancePage() {
  const [preset, setPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [from, setFrom] = useState(todayInputDate().slice(0, 8) + "01");
  const [to, setTo] = useState(todayInputDate());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = preset === "custom" ? `from=${from}&to=${to}` : `preset=${preset}`;
    const res = await officeFetch<Report>(`/api/office/finance?${query}`);
    if (res.ok) setReport(res.data);
    else setError(res.error);
    setLoading(false);
  }, [preset, from, to]);

  useEffect(() => {
    if (preset !== "custom") void load();
  }, [preset, load]);

  return (
    <OfficePageFrame requiredAny={["office:finance:read"]}>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Alfarooq Services — Income</h2>

        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-xl px-4 py-2.5 min-h-[40px] text-sm font-semibold ${preset === p ? "bg-primary-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
            >
              {p === "today" ? "Aaj" : p === "week" ? "Is hafte" : p === "month" ? "Is mahine" : "Custom"}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-slate-400">to</span>
              <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
              <button onClick={load} className="rounded-xl bg-primary-600 px-4 py-2.5 min-h-[40px] text-sm font-semibold text-white">
                Show
              </button>
            </>
          )}
        </div>

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {loading ? (
          <FinanceSkeleton />
        ) : report ? (
          <>
            <p className="text-sm text-slate-500">
              {formatDate(report.from)} — {formatDate(report.to)} · {report.summary.paymentsCount} payments received
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat label="Income (received)" value={report.summary.income} tone="emerald" />
              <Stat label="Office commissions / shares" value={report.summary.commissions} tone="amber" />
              <Stat label="Case expenses" value={report.summary.caseExpenses} tone="amber" />
              <Stat label="Salaries" value={report.summary.salaries} tone="amber" />
              <Stat label="Other expenses" value={report.summary.otherExpenses} tone="amber" />
              <Stat label="Net profit" value={report.summary.profit} tone={report.summary.profit >= 0 ? "primary" : "red"} big />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <span className="font-semibold text-slate-800">Offices ko abhi dena hai (liabilities, all time): </span>
              <span className={report.summary.liabilities > 0 ? "text-amber-700 font-bold" : "text-slate-700"}>{formatMoney(report.summary.liabilities)}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Per day</div>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Income</th>
                      <th className="px-3 py-2 text-right">Shares</th>
                      <th className="px-3 py-2 text-right">Expenses</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.days.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                          Is range mein koi entry nahi
                        </td>
                      </tr>
                    )}
                    {report.days.map((d) => (
                      <tr key={d.date}>
                        <td className="px-3 py-2">{formatDate(d.date)}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(d.income)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{formatMoney(d.commissions)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{formatMoney(d.caseExpenses + d.salaries + d.otherExpenses)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${d.profit >= 0 ? "text-slate-900" : "text-red-700"}`}>{formatMoney(d.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Per booking office</div>
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Office</th>
                      <th className="px-3 py-2 text-right">Income</th>
                      <th className="px-3 py-2 text-right">Commission / share</th>
                      <th className="px-3 py-2 text-right">Salaries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.offices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                          —
                        </td>
                      </tr>
                    )}
                    {report.offices.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2">
                          {o.name}
                          <span className="block text-xs text-slate-400">{BOOKING_OFFICE_TYPE_LABELS[o.type]}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(o.income)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{formatMoney(o.commissions)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{formatMoney(o.salaries)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </OfficePageFrame>
  );
}

function FinanceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Report load ho rahi hai">
      <div className="h-4 w-56 rounded bg-slate-200" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-3 w-3/4 rounded bg-slate-200" />
            <div className="mt-2 h-5 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((t) => (
          <div key={t} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="h-4 w-28 rounded bg-slate-200" />
            </div>
            <div className="divide-y divide-slate-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-3 py-3">
                  <div className="h-3.5 w-20 rounded bg-slate-200" />
                  <div className="h-3.5 flex-1 rounded bg-slate-100" />
                  <div className="h-3.5 w-14 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone: "emerald" | "amber" | "primary" | "red"; big?: boolean }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    primary: "border-primary-200 bg-primary-50 text-primary-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]} ${big ? "lg:col-span-1" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className={`mt-1 font-bold ${big ? "text-2xl" : "text-lg"}`}>{formatMoney(value)}</p>
    </div>
  );
}
