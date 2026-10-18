"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { PAYMENT_METHODS, ROLE_LABELS } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { inputCls, primaryBtnCls } from "./ui";
import type { DeptCommissionSummaryUser } from "./types";

// §W21 — Dept commission payout modal (Printing/Attestation user ko wasool).
// POST /api/office/dept-commissions/payout — direct payout (request flow nahi).
export default function DeptPayModal({
  user,
  onClose,
  onToast,
}: {
  user: DeptCommissionSummaryUser;
  onClose: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [form, setForm] = useState({
    amount: user.remaining > 0 ? String(Math.round(user.remaining * 100) / 100) : "",
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
    setSaving(true);
    const res = await officeFetch("/api/office/dept-commissions/payout", {
      method: "POST",
      json: {
        adminId: user.adminId,
        amount: Number(form.amount),
        method: form.method,
        entryDate: form.entryDate || undefined,
        remarks: form.remarks.trim() || undefined,
      },
    });
    setSaving(false);
    if (res.ok) {
      // office:changed event → summary section silent reload ho jayega.
      onToast("Commission payout save ho gaya", "success");
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
            <h3 className="text-lg font-bold text-slate-900">Pay commission — {user.name}</h3>
            <p className="text-xs text-slate-500">
              {ROLE_LABELS[user.role] || user.role} · Remaining: {formatMoney(user.remaining)}
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
              placeholder="Maslan: 1500"
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
            <label className="mb-1 block text-xs text-slate-500">Date</label>
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
            Pay karein
          </button>
        </div>
      </div>
    </div>
  );
}
