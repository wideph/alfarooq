"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { inputCls } from "./ui";
import ProfitBreakdownModal from "./ProfitBreakdownModal";
import {
  PROFIT_PERIOD_LABELS,
  profitPeriodRange,
  normalizeProfit,
  type FinanceReport,
  type ProfitBreakdown,
  type ProfitPeriod,
} from "./types";

// §W21 — Admin profit strip: prominent card with big NET number + period
// selector (All time / Current month / Last month / Custom). Hover par total
// deductions ka tooltip, click par "Profit ka hisab" modal.
export default function AdminProfitStrip() {
  const [period, setPeriod] = useState<ProfitPeriod>("ALL");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [profit, setProfit] = useState<ProfitBreakdown | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const { from, to } = profitPeriodRange(period, custom);
    const res = await officeFetch<FinanceReport>(`/api/office/finance?from=${from}&to=${to}`);
    if (res.ok) setProfit(normalizeProfit(res.data?.profit));
  }, [period, custom]);

  useEffect(() => {
    if (period === "CUSTOM" && (!custom.from || !custom.to)) return;
    void load();
  }, [load, period, custom.from, custom.to]);

  // Live refresh — office:changed / polling par strip bhi silent reload.
  useLiveRefresh(load);

  const net = profit?.net ?? 0;
  const netTone = net >= 0 ? "text-emerald-700" : "text-red-600";

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Scale className="h-4 w-4 text-primary-600" />
          Admin Profit
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(PROFIT_PERIOD_LABELS) as ProfitPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                period === p
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {PROFIT_PERIOD_LABELS[p]}
            </button>
          ))}
          {period === "CUSTOM" && (
            <>
              <input
                type="date"
                className={`${inputCls} !py-1.5 text-xs`}
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                aria-label="From date"
              />
              <input
                type="date"
                className={`${inputCls} !py-1.5 text-xs`}
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                aria-label="To date"
              />
            </>
          )}
        </div>
      </div>

      <div className="group relative">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`w-full rounded-2xl border p-5 text-left shadow-sm transition hover:shadow-md ${
            net >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
          title={`Total deductions: ${formatMoney(profit?.deductionsTotal ?? 0)}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Admin profit · {PROFIT_PERIOD_LABELS[period]}
          </p>
          <p className={`mt-1 text-3xl font-bold ${netTone}`}>{profit ? formatMoney(net) : "…"}</p>
          <p className="mt-1 text-xs text-slate-500">Click karein — poora hisab (profit ka breakdown)</p>
        </button>
        {/* Hover tooltip — total deductions */}
        <div className="pointer-events-none absolute -top-9 left-4 z-10 hidden rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block">
          Total deductions: {formatMoney(profit?.deductionsTotal ?? 0)}
        </div>
      </div>

      {modalOpen && (
        <ProfitBreakdownModal title="Admin" subtitle={PROFIT_PERIOD_LABELS[period]} onClose={() => setModalOpen(false)} />
      )}
    </section>
  );
}
