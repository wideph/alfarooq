"use client";

import { useState } from "react";
import { Loader2, Trash2, Wallet, X } from "lucide-react";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import type { BookingOfficeType } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { EmptyState, SectionHeader, TableSkeleton, inputCls, primaryBtnCls } from "./ui";
import type { OfficeExpenseItem } from "./types";

export type ExpenseOfficeOption = { id: string; name: string; type: BookingOfficeType };

// Office general expenses — har expense ke saath per-member split inline.
// Add form + delete (super admin) — behaviour unchanged, sirf polish hua.
export default function OfficeExpenses({
  expenses,
  offices,
  canAdd,
  canDelete,
  onChanged,
  onToast,
}: {
  expenses: OfficeExpenseItem[] | null;
  offices: ExpenseOfficeOption[];
  canAdd: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ officeId: "", amount: "", description: "", entryDate: todayInputDate() });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function submit() {
    if (!form.officeId) {
      onToast("Office select karein", "error");
      return;
    }
    if (!form.amount.trim() || Number(form.amount) <= 0) {
      onToast("Amount sahi nahi hai", "error");
      return;
    }
    if (!form.entryDate) {
      onToast("Date zaroori hai", "error");
      return;
    }
    setSaving(true);
    const res = await officeFetch("/api/office/office-expenses", {
      method: "POST",
      json: {
        // Contract keys + legacy keys (API in dono men se jo accept kare).
        officeId: form.officeId,
        bookingOfficeId: form.officeId,
        amount: form.amount.trim(),
        description: form.description.trim(),
        entryDate: form.entryDate,
        expenseDate: form.entryDate,
      },
    });
    setSaving(false);
    if (res.ok) {
      onToast("Office expense add ho gaya", "success");
      setModalOpen(false);
      setForm({ officeId: "", amount: "", description: "", entryDate: todayInputDate() });
      onChanged();
    } else {
      onToast(res.error, "error");
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    const res = await officeFetch(`/api/office/office-expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) {
      onToast("Office expense delete ho gaya", "success");
      onChanged();
    } else {
      onToast(res.error, "error");
    }
  }

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Wallet className="h-4 w-4 text-red-500" />}
        title="Office general expenses"
        count={expenses?.length}
        action={
          canAdd ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white"
            >
              Office expense add
            </button>
          ) : undefined
        }
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {!expenses ? (
          <TableSkeleton rows={3} />
        ) : expenses.length === 0 ? (
          <EmptyState>Koi office expense nahi</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">
                    {e.description || "Office expense"}
                    <span className="ml-1 text-xs font-normal text-slate-500">· {e.officeName}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(e.entryDate)}
                    {" · "}
                    <SplitText expense={e} />
                  </p>
                </div>
                <span className="shrink-0 font-bold text-red-600">{formatMoney(e.amount)}</span>
                {canDelete && (
                  <button
                    type="button"
                    aria-label="Expense delete karein"
                    disabled={deleting === e.id}
                    onClick={() => void remove(e.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">Office expense add</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Band karein"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Office *</label>
                <select
                  className={`${inputCls} w-full`}
                  value={form.officeId}
                  onChange={(e) => setForm({ ...form, officeId: e.target.value })}
                >
                  <option value="">Select karein…</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Amount (Rs) *</label>
                <input
                  className={`${inputCls} w-full`}
                  inputMode="decimal"
                  placeholder="Maslan: 500"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
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
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Description (optional)</label>
                <input
                  className={`${inputCls} w-full`}
                  placeholder="Expense ki tafseel likhna optional hai"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => void submit()} className={primaryBtnCls}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save expense
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Per-member split inline — PROFIT_SHARE: "AW D −33,832.50 • Fan −33,832.50";
// FIXED_COMMISSION / SALARY (ya split na ho): "office account".
function SplitText({ expense }: { expense: OfficeExpenseItem }) {
  if (expense.allocations.length === 0) {
    return <span>{expense.officeType === "PROFIT_SHARE" ? "members par split" : "office account"}</span>;
  }
  return (
    <span>
      {expense.allocations.map((a, i) => (
        <span key={`${a.memberId}-${i}`}>
          {i > 0 && " • "}
          {a.memberName} −{formatMoney(a.amount)}
        </span>
      ))}
    </span>
  );
}
