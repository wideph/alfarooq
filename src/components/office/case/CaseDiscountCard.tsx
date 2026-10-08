"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgePercent, Loader2, X } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDateTime, formatMoney, officeFetch } from "@/lib/office/client";
import { type DiscountRequestItem, ghostBtnClass, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N8 — booking office sirf discount REQUEST kar sakta hai; admin /
// cashier decide karte hain (commission / admin profit / partial se minus).
export default function CaseDiscountCard({
  caseId,
  admin,
  onReload,
  onMessage,
}: {
  caseId: string;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canRequest = adminCanAny(admin, ["office:cases:write"]);
  const canDecide = admin.role === "admin" || adminCanAny(admin, ["office:payments:verify"]);
  const [items, setItems] = useState<DiscountRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<DiscountRequestItem | null>(null);
  const [deductFrom, setDeductFrom] = useState<"COMMISSION" | "PROFIT" | "PARTIAL">("COMMISSION");
  const [partialAmount, setPartialAmount] = useState("");

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: DiscountRequestItem[] }>(`/api/office/cases/${caseId}/discount-requests`);
    if (res.ok) setItems(res.data.items);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function request() {
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/discount-requests`, {
      method: "POST",
      json: { amount: form.amount, reason: form.reason },
    });
    if (res.ok) {
      onMessage("Discount request bhej di gayi — admin / cashier decide karein ge");
      setForm({ amount: "", reason: "" });
      await load();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function decide(action: "ACCEPT" | "REJECT") {
    if (!deciding) return;
    setBusy(true);
    const res = await officeFetch(`/api/office/discount-requests`, {
      method: "PATCH",
      json: {
        id: deciding.id,
        action,
        ...(action === "ACCEPT"
          ? { deductFrom, ...(deductFrom === "PARTIAL" ? { partialCommissionAmount: partialAmount } : {}) }
          : {}),
      },
    });
    if (res.ok) {
      onMessage(action === "ACCEPT" ? "Discount accept ho gaya — agreed amount update ho gayi" : "Discount request reject ho gayi");
      setDeciding(null);
      setPartialAmount("");
      await load();
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  if (!canRequest && !canDecide) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <BadgePercent className="w-4 h-4 text-primary-600" /> Discount requests
      </h3>

      {canRequest && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Naya discount request (booking office)</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className={`${inputClass} sm:max-w-[10rem]`}
              inputMode="decimal"
              placeholder="Amount (Rs)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Wajah / reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <button disabled={busy || !form.amount} onClick={request} className={primaryBtnClass}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Request karein
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {items.length === 0 && <li className="p-3 text-slate-400">Koi discount request nahi</li>}
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <span className="font-bold text-slate-900">{formatMoney(item.amount)}</span>
                {item.reason && <span className="ml-2 text-slate-500">{item.reason}</span>}
                <span className="block text-[11px] text-slate-400">
                  {formatDateTime(item.createdAt)}
                  {item.deductFrom ? ` · ${item.deductFrom} se minus` : ""}
                  {item.decidedAt ? ` · decided ${formatDateTime(item.decidedAt)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    item.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : item.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.status}
                </span>
                {canDecide && item.status === "PENDING" && (
                  <button
                    onClick={() => {
                      setDeciding(item);
                      setDeductFrom("COMMISSION");
                      setPartialAmount("");
                    }}
                    className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Decide
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {deciding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDeciding(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Discount decide karein — {formatMoney(deciding.amount)}</h4>
              <button onClick={() => setDeciding(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            {deciding.reason && <p className="text-sm text-slate-500">Wajah: {deciding.reason}</p>}
            <div className="space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Accept karein to kahan se minus ho:</p>
              {(
                [
                  ["COMMISSION", "Booking office ki commission se"],
                  ["PROFIT", "Admin profit se"],
                  ["PARTIAL", "Partial (donon se split)"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <input type="radio" name="deductFrom" checked={deductFrom === value} onChange={() => setDeductFrom(value)} />
                  {label}
                </label>
              ))}
              {deductFrom === "PARTIAL" && (
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="Commission se kitna minus (Rs) — baqi profit se"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || (deductFrom === "PARTIAL" && !partialAmount)} onClick={() => decide("ACCEPT")} className={primaryBtnClass}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Accept
              </button>
              <button
                disabled={busy}
                onClick={() => decide("REJECT")}
                className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                Reject
              </button>
              <button disabled={busy} onClick={() => setDeciding(null)} className={ghostBtnClass}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
