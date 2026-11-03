"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { DEPT_PAYOUT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { PAYMENT_METHODS, ROLE_LABELS } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { inputCls, primaryBtnCls } from "./ui";
import type { DeptCommissionSummaryUser, DeptPayoutKind } from "./types";

// §W21 / §W51 — department user ko payment: commission, courier kharcha ya
// other kharcha (teeno alag). POST /api/office/dept-payouts — sirf REQUEST
// banti hai; user accept kare tab paid shumar hoti hai.
export function deptPayable(user: DeptCommissionSummaryUser, kind: DeptPayoutKind) {
  if (kind === "COMMISSION") return Math.max(0, user.remaining - user.pending);
  const bucket = kind === "COURIER_EXPENSE" ? user.courier : user.other;
  return Math.max(0, bucket.remaining - bucket.pending);
}

export default function DeptPayModal({
  user,
  kind,
  onClose,
  onToast,
}: {
  user: DeptCommissionSummaryUser;
  kind: DeptPayoutKind;
  onClose: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const payable = deptPayable(user, kind);
  const label = DEPT_PAYOUT_KIND_LABELS[kind];
  const [form, setForm] = useState({
    amount: payable > 0 ? String(Math.round(payable * 100) / 100) : "",
    method: "CASH",
    entryDate: todayInputDate(),
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  // §W54: baqi se zyada = advance (user ka hisaab minus mein).
  const typed = Number(form.amount.replace(/,/g, ""));
  const advance = Number.isFinite(typed) && typed > payable ? typed - payable : 0;

  async function submit() {
    if (!form.amount.trim() || Number(form.amount) <= 0) {
      onToast("Amount sahi nahi hai", "error");
      return;
    }
    setSaving(true);
    const res = await officeFetch("/api/office/dept-payouts", {
      method: "POST",
      json: {
        adminId: user.adminId,
        kind,
        amount: form.amount.trim(),
        method: form.method,
        entryDate: form.entryDate || undefined,
        remarks: form.remarks.trim() || undefined,
      },
    });
    setSaving(false);
    if (res.ok) {
      // office:changed event → summary section silent reload ho jayega.
      onToast(`${label} ki payment request bhej di — ${user.name} accept karega`, "success");
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
            <h3 className="text-lg font-bold text-slate-900">
              Pay {label.toLowerCase()} — {user.name}
            </h3>
            <p className="text-xs text-slate-500">
              {ROLE_LABELS[user.role] || user.role} · Baqi: {formatMoney(payable)}
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
        <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Request {user.name} ko jayegi — jab wo &quot;Mil gaya&quot; (accept) karega tab paid shumar hogi.
        </p>
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
        {advance > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            Advance: {formatMoney(advance)} baqi se zyada — accept hone par {user.name} ka {label.toLowerCase()} hisaab
            minus mein chala jayega (agle {kind === "COMMISSION" ? "commission" : "kharchon"} se barabar hoga).
          </p>
        )}
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
