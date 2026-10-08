"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, formatDateTime, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { LEDGER_TYPE_LABELS } from "@/lib/office/labels";
import { type CaseDetail, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// Case expenses (BR4.2/BR6), this case's ledger rows, and (super admin) audit.
export default function CaseExpensesLedger({
  detail,
  admin,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canExpenses = adminCanAny(admin, ["office:expenses:write"]);
  const canSeeExpenses = canExpenses || adminCanAny(admin, ["office:ledger:read", "office:finance:read"]);
  const showLedger = detail.ledger.length > 0 || admin.role === "booking_office" || adminCanAny(admin, ["office:ledger:read"]);
  const [form, setForm] = useState({ amount: "", description: "", expenseDate: todayInputDate() });
  const [busy, setBusy] = useState(false);

  async function addExpense() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/expenses`, { method: "POST", json: form });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Expense add ho gaya");
      setForm({ amount: "", description: "", expenseDate: todayInputDate() });
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function removeExpense(id: string) {
    if (!confirm("Expense delete karein?")) return;
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/expenses?expenseId=${id}`, { method: "DELETE" });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Expense delete ho gaya");
    } else onMessage(res.error, "error");
  }

  const expenseTotal = detail.expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="space-y-4">
      {canSeeExpenses && (
        <div id="expenses" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 scroll-mt-24">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Case expenses</h3>
            <span className="text-sm text-slate-500">Total {formatMoney(expenseTotal)}</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {detail.expenses.length === 0 && <li className="p-3 text-slate-400">Koi expense nahi</li>}
            {detail.expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 p-3">
                <span>
                  <span className="font-medium text-slate-800">{e.description}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {formatDate(e.expenseDate)}
                    {e.createdByName ? ` · ${e.createdByName}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{formatMoney(e.amount)}</span>
                  {canExpenses && (
                    <button onClick={() => removeExpense(e.id)} className="rounded-lg p-1 text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {canExpenses && (
            <div className="flex flex-col md:flex-row gap-2">
              <input className={inputClass} inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <input className={inputClass} placeholder="Description (e.g. board fee, courier)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <input type="date" className={inputClass} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
              <button disabled={busy || !form.amount || !form.description.trim()} onClick={addExpense} className={primaryBtnClass}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
              </button>
            </div>
          )}
        </div>
      )}

      {showLedger && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-900">Office account entries (this case)</h3>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-3">Date</th>
                <th className="py-1 pr-3">Type</th>
                <th className="py-1 pr-3">Member</th>
                <th className="py-1 pr-3 text-right">Credit</th>
                <th className="py-1 pr-3 text-right">Debit</th>
                <th className="py-1">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-400">
                    Abhi koi entry nahi
                  </td>
                </tr>
              )}
              {detail.ledger.map((l) => (
                <tr key={l.id}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(l.entryDate)}</td>
                  <td className="py-1.5 pr-3">{LEDGER_TYPE_LABELS[l.type] || l.type}</td>
                  <td className="py-1.5 pr-3 text-slate-500">{l.member?.name || "Office"}</td>
                  <td className="py-1.5 pr-3 text-right text-emerald-700">{l.direction === "CREDIT" ? formatMoney(l.amount) : ""}</td>
                  <td className="py-1.5 pr-3 text-right text-red-700">{l.direction === "DEBIT" ? formatMoney(l.amount) : ""}</td>
                  <td className="py-1.5 text-xs text-slate-500">{l.remarks || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {admin.role === "admin" && detail.audit.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
          <h3 className="font-bold text-slate-900">Audit log (last 20)</h3>
          <ul className="divide-y divide-slate-100 text-xs">
            {detail.audit.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="text-slate-400">{formatDateTime(a.createdAt)}</span> ·{" "}
                <span className="font-semibold text-slate-700">{a.actorName || a.actorRole}</span> · <span className="font-mono">{a.action}</span>
                {a.after !== null && a.after !== undefined && (
                  <span className="ml-1 break-all text-slate-500">{JSON.stringify(a.after).slice(0, 160)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
