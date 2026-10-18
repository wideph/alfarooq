"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { inputCls } from "./ui";
import {
  PROFIT_DEDUCTION_LINES,
  PROFIT_PERIOD_LABELS,
  profitPeriodRange,
  normalizeProfit,
  type FinanceReport,
  type ProfitBreakdown,
  type ProfitPeriod,
} from "./types";

// §W21 — "Profit ka hisab" modal. Admin scope (no officeId) ya single-office
// scope (officeId). Apna period selector rakhta hai — change par refetch.
export default function ProfitBreakdownModal({
  title,
  subtitle,
  officeId,
  onClose,
}: {
  title: string;
  subtitle?: string;
  officeId?: string;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<ProfitPeriod>("ALL");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [profit, setProfit] = useState<ProfitBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { from, to } = profitPeriodRange(period, custom);
    const qs = `from=${from}&to=${to}${officeId ? `&officeId=${encodeURIComponent(officeId)}` : ""}`;
    const res = await officeFetch<FinanceReport>(`/api/office/finance?${qs}`);
    if (res.ok) {
      // Office scope: top-level profit (scoped by API); fallback us office ki
      // row ka profit object (contract: offices[] row bhi profit rakhta hai).
      const scoped =
        normalizeProfit(res.data?.profit) ??
        (officeId
          ? normalizeProfit((res.data?.offices ?? []).find((o) => o.id === officeId)?.profit)
          : null);
      setProfit(scoped);
      if (!scoped) setError("Profit data abhi available nahi");
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [period, custom, officeId]);

  useEffect(() => {
    // Custom period: dono dates chune bina fetch na karein.
    if (period === "CUSTOM" && (!custom.from || !custom.to)) return;
    void load();
  }, [load, period, custom.from, custom.to]);

  const net = profit?.net ?? 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Profit ka hisab — {title}</h3>
            {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Band karein"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Period selector */}
        <div className="mt-4 flex flex-wrap gap-1.5">
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
        </div>
        {period === "CUSTOM" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              className={`${inputCls} w-full`}
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
            <input
              type="date"
              className={`${inputCls} w-full`}
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Hisaab load ho raha hai
            </div>
          ) : error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>
          ) : profit ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Received (wasooli)</span>
                <span className="font-bold text-emerald-700">{formatMoney(profit.received)}</span>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {PROFIT_DEDUCTION_LINES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-red-600">− {formatMoney(profit[key])}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Total deductions</span>
                <span className="font-bold text-red-600">− {formatMoney(profit.deductionsTotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border-t-2 border-slate-200 pt-2.5">
                <span className="text-base font-bold text-slate-900">NET (Admin profit)</span>
                <span className={`text-xl font-bold ${net >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {formatMoney(net)}
                </span>
              </div>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                Received − deductions = Net
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
