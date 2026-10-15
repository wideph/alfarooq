"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { PAYMENT_METHODS } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { inputCls, primaryBtnCls } from "./ui";
import type { FinanceUserRow } from "./types";

// Pay modal — payout REQUEST bhejta hai (PENDING). Ledger men tab aata hai jab
// member ka linked user accept kare. (Flow unchanged, sirf extract hua.)
export default function PayModal({
  target,
  onClose,
  onToast,
}: {
  target: FinanceUserRow;
  onClose: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [form, setForm] = useState({
    amount: target.due > 0 ? String(Math.round(target.due * 100) / 100) : "",
    method: "CASH",
    entryDate: todayInputDate(),
    remarks: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.amount.trim() || Number(form.amount) <= 0) {
      onToast("Amount sahi nahi hai", "error");
      return;
    }
    if (!form.entryDate) {
      onToast("Date zaroori hai", "error");
      return;
    }
    setSaving(true);
    const res = await officeFetch("/api/office/payouts", {
      method: "POST",
      json: {
        bookingOfficeId: target.officeId,
        memberId: target.memberId,
        amount: form.amount.trim(),
        method: form.method,
        entryDate: form.entryDate,
        remarks: form.remarks.trim(),
      },
    });
    setSaving(false);
    if (res.ok) {
      onToast("Payout request bhej di — office holder accept kare ga to ledger men aa jayegi", "success");
      onClose();
    } else {
      onToast(res.error, "error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Pay — {target.memberName}</h3>
            <p className="text-xs text-slate-500">
              {target.officeName} · Due: {formatMoney(target.due)}
            </p>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Amount (Rs) *</label>
            <input
              className={`${inputCls} w-full`}
              inputMode="decimal"
              placeholder="Maslan: 5000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Method</label>
            <select
              className={`${inputCls} w-full`}
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Date *</label>
            <input
              type="date"
              className={`${inputCls} w-full`}
              value={form.entryDate}
              onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Remarks (optional)</label>
            <input
              className={`${inputCls} w-full`}
              placeholder="Remarks likhna optional hai"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </div>
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Ye payout request jayegi — office holder accept kare ga to ledger men aa jayegi.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={() => void submit()} className={primaryBtnCls}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Request bhejein
          </button>
        </div>
      </div>
    </div>
  );
}
